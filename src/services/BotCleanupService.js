// src/services/BotCleanupService.js - Updated with correct logger import
const { Op } = require("sequelize");
const {
  Bot,
  User,
  UserLog,
  Feedback,
  Admin,
  BroadcastHistory,
  Wallet,
  WalletTransaction,
} = require("../models");
const MiniBotManager = require("./MiniBotManager");
const { logger, info, error, warn, debug } = require("../utils/logger"); // Fixed path

class BotCleanupService {
  constructor() {
    this.reminderIntervals = {
      "1month": 30 * 24 * 60 * 60 * 1000,
      "3month": 90 * 24 * 60 * 60 * 1000,
      "6month": 180 * 24 * 60 * 60 * 1000,
      "9month": 270 * 24 * 60 * 60 * 1000,
      "12month": 365 * 24 * 60 * 60 * 1000,
    };
    this.reminderSentCache = new Map();
    this.isRunning = false;
    this.lastCleanup = null;
  }

  /**
   * Run full cleanup process
   */
  async runFullCleanup() {
    if (this.isRunning) {
      info("🔄 Cleanup already running, skipping...");
      return;
    }

    this.isRunning = true;
    info("🧹 Starting full cleanup process...");

    try {
      // 1. Clean broken tokens
      const tokenResults = await this.cleanBrokenTokens();

      // 2. Check for deleted bot usernames
      const usernameResults = await this.checkDeletedUsernames();

      // 3. Check for blocked bots
      const blockedResults = await this.checkBlockedBots();

      // 4. Process inactivity reminders
      const reminderResults = await this.processInactivityReminders();

      // 5. Delete 12-month inactive bots
      const deletionResults = await this.deleteInactiveBots();

      this.lastCleanup = new Date();

      const results = {
        timestamp: new Date().toISOString(),
        brokenTokens: tokenResults,
        deletedUsernames: usernameResults,
        blockedBots: blockedResults,
        reminders: reminderResults,
        deletions: deletionResults,
      };

      info("✅ Cleanup completed:", results);
      return results;
    } catch (error) {
      error("❌ Cleanup error:", error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Clean bots with broken/invalid tokens
   */
  async cleanBrokenTokens() {
    logger.info("🔍 Checking for broken tokens...");
    const results = { checked: 0, removed: 0, failed: 0 };

    try {
      const bots = await Bot.findAll({ where: { is_active: true } });
      results.checked = bots.length;

      for (const bot of bots) {
        try {
          const token = bot.getDecryptedToken();
          if (!token) {
            await this.removeBotWithData(bot.id, "Invalid or missing token");
            results.removed++;
            continue;
          }

          // Validate token with Telegram API
          const isValid = await this.validateTokenWithTelegram(token);
          if (!isValid) {
            await this.removeBotWithData(
              bot.id,
              "Invalid token - Telegram API rejected",
            );
            results.removed++;
          }
        } catch (error) {
          logger.error(`Failed to check token for bot ${bot.id}:`, error);
          results.failed++;
        }
      }

      logger.info(
        `✅ Token cleanup: ${results.removed} removed, ${results.failed} failed`,
      );
      return results;
    } catch (error) {
      logger.error("Error in cleanBrokenTokens:", error);
      return results;
    }
  }

  /**
   * Check if bot username still exists on Telegram
   */
  async checkDeletedUsernames() {
    logger.info("🔍 Checking for deleted bot usernames...");
    const results = { checked: 0, removed: 0, failed: 0 };

    try {
      const bots = await Bot.findAll({ where: { is_active: true } });
      results.checked = bots.length;

      for (const bot of bots) {
        try {
          const token = bot.getDecryptedToken();
          if (!token) continue;

          // Check if bot still exists on Telegram
          const botInfo = await this.getBotInfo(token);
          if (!botInfo) {
            await this.removeBotWithData(
              bot.id,
              "Bot username deleted or bot removed from Telegram",
            );
            results.removed++;
          } else if (botInfo.username !== bot.bot_username) {
            // Username changed
            await bot.update({ bot_username: botInfo.username });
            logger.info(
              `Updated username for bot ${bot.bot_name}: ${botInfo.username}`,
            );
          }
        } catch (error) {
          logger.error(`Failed to check username for bot ${bot.id}:`, error);
          results.failed++;
        }
      }

      logger.info(
        `✅ Username check: ${results.removed} removed, ${results.failed} failed`,
      );
      return results;
    } catch (error) {
      logger.error("Error in checkDeletedUsernames:", error);
      return results;
    }
  }

  /**
   * Check if bot has been blocked by owner
   */
  async checkBlockedBots() {
    logger.info("🔍 Checking for blocked bots...");
    const results = { checked: 0, removed: 0, failed: 0 };

    try {
      const bots = await Bot.findAll({ where: { is_active: true } });
      results.checked = bots.length;

      for (const bot of bots) {
        try {
          const token = bot.getDecryptedToken();
          if (!token) continue;

          // Check if bot can send a test message to itself
          const canSend = await this.testBotSend(token);
          if (!canSend) {
            await this.removeBotWithData(
              bot.id,
              "Bot blocked - cannot send messages",
            );
            results.removed++;
          }
        } catch (error) {
          logger.error(
            `Failed to check block status for bot ${bot.id}:`,
            error,
          );
          results.failed++;
        }
      }

      logger.info(
        `✅ Block check: ${results.removed} removed, ${results.failed} failed`,
      );
      return results;
    } catch (error) {
      logger.error("Error in checkBlockedBots:", error);
      return results;
    }
  }

  /**
   * Process inactivity reminders
   */
  async processInactivityReminders() {
    logger.info("🔍 Processing inactivity reminders...");
    const results = { sent: 0, failed: 0 };

    try {
      const bots = await Bot.findAll({ where: { is_active: true } });

      for (const bot of bots) {
        try {
          const lastActivity = bot.last_activity || bot.created_at;
          const daysInactive = Math.floor(
            (Date.now() - new Date(lastActivity).getTime()) /
              (24 * 60 * 60 * 1000),
          );

          const reminderPeriods = [30, 90, 180, 270, 365];

          for (const period of reminderPeriods) {
            const key = `${bot.id}_${period}`;

            if (this.reminderSentCache.has(key)) continue;

            if (daysInactive >= period) {
              const sent = await this.sendReminder(bot, period, daysInactive);
              if (sent) {
                this.reminderSentCache.set(key, new Date().toISOString());
                results.sent++;
              } else {
                results.failed++;
              }
              break;
            }
          }
        } catch (error) {
          logger.error(`Failed to process reminders for bot ${bot.id}:`, error);
          results.failed++;
        }
      }

      logger.info(
        `✅ Reminders sent: ${results.sent}, failed: ${results.failed}`,
      );
      return results;
    } catch (error) {
      logger.error("Error in processInactivityReminders:", error);
      return results;
    }
  }

  /**
   * Send inactivity reminder to bot owner
   */
  async sendReminder(bot, period, daysInactive) {
    try {
      const owner = await User.findOne({
        where: { telegram_id: bot.owner_id },
      });
      if (!owner) {
        logger.warn(`Owner not found for bot ${bot.id}`);
        return false;
      }

      const periodNames = {
        30: "1 month",
        90: "3 months",
        180: "6 months",
        270: "9 months",
        365: "1 year",
      };

      const periodName = periodNames[period] || `${period} days`;
      const isFinal = period === 365;

      let message = `⚠️ *Bot Inactivity Reminder*\n\n`;
      message += `Your bot *${bot.bot_name}* (@${bot.bot_username}) has been inactive for *${daysInactive} days* (${periodName}).\n\n`;

      if (isFinal) {
        message += `🚨 *FINAL WARNING!*\n\n`;
        message += `Your bot will be *PERMANENTLY DELETED* within 48 hours unless you take action.\n\n`;
        message += `*To keep your bot:*\n`;
        message += `• Send a message to your bot\n`;
        message += `• Visit your bot dashboard\n`;
        message += `• Reply to any pending messages\n\n`;
        message += `⚠️ *This is your last chance to save your bot!*`;
      } else {
        message += `*To keep your bot active:*\n`;
        message += `• Send a message to your bot\n`;
        message += `• Visit your bot dashboard\n`;
        message += `• Reply to any pending messages\n\n`;
        message += `If no activity is detected by the next reminder (${periodNames[period + 90] || "12 months"}), your bot may be deleted.\n\n`;
        message += `_This is an automated reminder._`;
      }

      // Send via main bot
      const mainBot = require("../../app").bot;
      if (mainBot) {
        await mainBot.telegram.sendMessage(owner.telegram_id, message, {
          parse_mode: "Markdown",
        });
        logger.info(`Reminder sent for bot ${bot.bot_name} (${period} days)`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Failed to send reminder for bot ${bot.id}:`, error);
      return false;
    }
  }

  /**
   * Delete bots inactive for 12+ months
   */
  async deleteInactiveBots() {
    logger.info("🗑️ Deleting 12+ month inactive bots...");
    const results = { checked: 0, deleted: 0, failed: 0 };

    try {
      const bots = await Bot.findAll({ where: { is_active: true } });
      results.checked = bots.length;

      for (const bot of bots) {
        try {
          const lastActivity = bot.last_activity || bot.created_at;
          const daysInactive = Math.floor(
            (Date.now() - new Date(lastActivity).getTime()) /
              (24 * 60 * 60 * 1000),
          );

          if (daysInactive >= 365) {
            const key = `${bot.id}_365`;
            if (!this.reminderSentCache.has(key)) {
              await this.sendReminder(bot, 365, daysInactive);
              this.reminderSentCache.set(key, new Date().toISOString());
              logger.info(
                `Final reminder sent for bot ${bot.bot_name}, waiting for action`,
              );
              continue;
            }

            const reminderSent = new Date(this.reminderSentCache.get(key));
            const hoursSinceReminder =
              (Date.now() - reminderSent.getTime()) / (60 * 60 * 1000);

            if (hoursSinceReminder >= 48) {
              await this.removeBotWithData(bot.id, "Inactive for 12+ months");
              results.deleted++;
            }
          }
        } catch (error) {
          logger.error(`Failed to delete inactive bot ${bot.id}:`, error);
          results.failed++;
        }
      }

      logger.info(
        `✅ Inactive deletion: ${results.deleted} deleted, ${results.failed} failed`,
      );
      return results;
    } catch (error) {
      logger.error("Error in deleteInactiveBots:", error);
      return results;
    }
  }

  /**
   * Remove bot and all associated data
   */
  async removeBotWithData(botId, reason) {
    try {
      logger.info(`🗑️ Removing bot ${botId}: ${reason}`);

      const bot = await Bot.findByPk(botId);
      if (!bot) {
        logger.warn(`Bot ${botId} not found for deletion`);
        return false;
      }

      // Stop bot in MiniBotManager
      await MiniBotManager.stopBot(botId);

      // Delete all associated data
      const models = {
        UserLog: UserLog,
        Feedback: Feedback,
        Admin: Admin,
        BroadcastHistory: BroadcastHistory,
        Wallet: Wallet,
        WalletTransaction: WalletTransaction,
      };

      for (const [name, model] of Object.entries(models)) {
        try {
          await model.destroy({ where: { bot_id: botId } });
          logger.info(`Deleted ${name} records for bot ${botId}`);
        } catch (error) {
          logger.error(
            `Failed to delete ${name} records for bot ${botId}:`,
            error,
          );
        }
      }

      // Delete bot itself
      await bot.destroy();

      logger.info(`✅ Bot ${botId} (${bot.bot_name}) permanently deleted`);
      return true;
    } catch (error) {
      logger.error(`Error removing bot ${botId}:`, error);
      return false;
    }
  }

  /**
   * Validate token with Telegram API
   */
  async validateTokenWithTelegram(token) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getMe`,
      );
      const data = await response.json();
      return data.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get bot info from Telegram
   */
  async getBotInfo(token) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getMe`,
      );
      const data = await response.json();
      if (data.ok) {
        return data.result;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Test if bot can send messages
   */
  async testBotSend(token) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getMe`,
      );
      const data = await response.json();
      return data.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get cleanup status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      reminderCacheSize: this.reminderSentCache.size,
      lastCleanup: this.lastCleanup ? this.lastCleanup.toISOString() : null,
    };
  }

  /**
   * Clear reminder cache (for testing)
   */
  clearReminderCache() {
    this.reminderSentCache.clear();
  }

  /**
   * Run cleanup on a schedule (called by cron)
   */
  async scheduledCleanup() {
    logger.info("⏰ Running scheduled cleanup...");
    return await this.runFullCleanup();
  }
}

module.exports = new BotCleanupService();
