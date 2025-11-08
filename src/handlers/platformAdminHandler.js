// src/handlers/platformAdminHandler.js - COMPREHENSIVE PRODUCTION VERSION
const { Markup } = require('telegraf');
const { User, Bot, UserLog, Feedback, Admin, BroadcastHistory } = require('../models');
const { formatNumber, escapeMarkdown } = require('../utils/helpers');

// Store admin management sessions
const platformAdminSessions = new Map();

class PlatformAdminHandler {
  
  // Check if user is platform creator
  static isPlatformCreator(userId) {
    return userId === 1827785384; // Your user ID
  }

  // Platform admin dashboard
  static async platformDashboard(ctx) {
    try {
      if (!this.isPlatformCreator(ctx.from.id)) {
        await ctx.reply('❌ Platform admin access required.');
        return;
      }

      // Get comprehensive platform statistics
      const [
        totalUsers,
        totalBotOwners,
        totalBots,
        activeBots,
        totalMessages,
        pendingMessages,
        totalBroadcasts,
        todayUsers
      ] = await Promise.all([
        User.count(),
        User.count({ 
          include: [{
            model: Bot,
            as: 'OwnedBots',
            required: true
          }]
        }),
        Bot.count(),
        Bot.count({ where: { is_active: true } }),
        Feedback.count(),
        Feedback.count({ where: { is_replied: false } }),
        BroadcastHistory.count(),
        User.count({
          where: {
            last_active: {
              [require('sequelize').Op.gte]: new Date(new Date() - 24 * 60 * 60 * 1000)
            }
          }
        })
      ]);

      const dashboardMessage = `👑 *Platform Admin Dashboard*\n\n` +
        `📊 *Platform Statistics:*\n` +
        `👥 Total Users: ${formatNumber(totalUsers)}\n` +
        `👥 Active Today: ${formatNumber(todayUsers)}\n` +
        `🤖 Bot Owners: ${formatNumber(totalBotOwners)}\n` +
        `🤖 Total Bots: ${formatNumber(totalBots)}\n` +
        `🟢 Active Bots: ${formatNumber(activeBots)}\n` +
        `💬 Total Messages: ${formatNumber(totalMessages)}\n` +
        `📨 Pending Messages: ${formatNumber(pendingMessages)}\n` +
        `📢 Total Broadcasts: ${formatNumber(totalBroadcasts)}\n\n` +
        `*Admin Actions:*`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('👥 User Management', 'platform_users')],
        [Markup.button.callback('🤖 Bot Management', 'platform_bots')],
        [Markup.button.callback('📢 Platform Broadcast', 'platform_broadcast')],
        [Markup.button.callback('🚫 Ban Management', 'platform_bans')],
        [Markup.button.callback('📊 Advanced Analytics', 'platform_analytics')],
        [Markup.button.callback('🔄 Refresh Stats', 'platform_dashboard')]
      ]);

      if (ctx.updateType === 'callback_query') {
        await ctx.editMessageText(dashboardMessage, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      } else {
        await ctx.replyWithMarkdown(dashboardMessage, keyboard);
      }

      await ctx.answerCbQuery();

    } catch (error) {
      console.error('Platform dashboard error:', error);
      await ctx.reply('❌ Error loading platform dashboard.');
    }
  }

  // User management with pagination
  static async userManagement(ctx, page = 1) {
    try {
      if (!this.isPlatformCreator(ctx.from.id)) {
        await ctx.answerCbQuery('❌ Access denied');
        return;
      }

      const limit = 10;
      const offset = (page - 1) * limit;

      const { count, rows: users } = await User.findAndCountAll({
        order: [['last_active', 'DESC']],
        limit,
        offset
      });

      const totalPages = Math.ceil(count / limit);

      let message = `👥 *User Management* - Page ${page}/${totalPages}\n\n` +
        `*Total Users:* ${formatNumber(count)}\n\n` +
        `*Recent Users:*\n`;

      users.forEach((user, index) => {
        const userInfo = user.username ? 
          `@${user.username} (${user.first_name})` : 
          `${user.first_name} (ID: ${user.telegram_id})`;
        
        const status = user.is_banned ? '🚫 BANNED' : '✅ Active';
        
        message += `*${offset + index + 1}.* ${userInfo}\n` +
          `   Status: ${status}\n` +
          `   Last Active: ${user.last_active.toLocaleDateString()}\n\n`;
      });

      const keyboardButtons = [];

      // Pagination buttons
      if (page > 1) {
        keyboardButtons.push(Markup.button.callback('⬅️ Previous', `platform_users:${page - 1}`));
      }
      if (page < totalPages) {
        keyboardButtons.push(Markup.button.callback('Next ➡️', `platform_users:${page + 1}`));
      }

      const keyboard = Markup.inlineKeyboard([
        keyboardButtons,
        [
          Markup.button.callback('🚫 Ban User', 'platform_ban_user'),
          Markup.button.callback('✅ Unban User', 'platform_unban_user')
        ],
        [Markup.button.callback('📊 User Stats', 'platform_user_stats')],
        [Markup.button.callback('🔙 Back to Dashboard', 'platform_dashboard')]
      ]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });

    } catch (error) {
      console.error('User management error:', error);
      await ctx.answerCbQuery('❌ Error loading users');
    }
  }

  // Bot management with detailed info
  static async botManagement(ctx, page = 1) {
    try {
      if (!this.isPlatformCreator(ctx.from.id)) {
        await ctx.answerCbQuery('❌ Access denied');
        return;
      }

      const limit = 8;
      const offset = (page - 1) * limit;

      const { count, rows: bots } = await Bot.findAndCountAll({
        include: [{
          model: User,
          as: 'Owner',
          attributes: ['username', 'first_name', 'is_banned']
        }],
        order: [['created_at', 'DESC']],
        limit,
        offset
      });

      const totalPages = Math.ceil(count / limit);

      let message = `🤖 *Bot Management* - Page ${page}/${totalPages}\n\n` +
        `*Total Bots:* ${formatNumber(count)}\n\n` +
        `*Recent Bots:*\n`;

      bots.forEach((bot, index) => {
        const ownerInfo = bot.Owner ? 
          (bot.Owner.is_banned ? `@${bot.Owner.username} 🚫` : `@${bot.Owner.username}`) : 
          `User#${bot.owner_id}`;
        
        const status = bot.is_active ? '🟢 Active' : '🔴 Inactive';
        const userCount = 'N/A'; // You might want to add this statistic
        
        message += `*${offset + index + 1}.* ${bot.bot_name} (@${bot.bot_username})\n` +
          `   Owner: ${ownerInfo}\n` +
          `   Status: ${status}\n` +
          `   Created: ${bot.created_at.toLocaleDateString()}\n\n`;
      });

      const keyboardButtons = [];

      // Pagination buttons
      if (page > 1) {
        keyboardButtons.push(Markup.button.callback('⬅️ Previous', `platform_bots:${page - 1}`));
      }
      if (page < totalPages) {
        keyboardButtons.push(Markup.button.callback('Next ➡️', `platform_bots:${page + 1}`));
      }

      const keyboard = Markup.inlineKeyboard([
        keyboardButtons,
        [
          Markup.button.callback('🔄 Toggle Bot', 'platform_toggle_bot'),
          Markup.button.callback('🗑️ Delete Bot', 'platform_delete_bot')
        ],
        [Markup.button.callback('🔙 Back to Dashboard', 'platform_dashboard')]
      ]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });

    } catch (error) {
      console.error('Bot management error:', error);
      await ctx.answerCbQuery('❌ Error loading bots');
    }
  }

  // Ban management
  static async banManagement(ctx) {
    try {
      if (!this.isPlatformCreator(ctx.from.id)) {
        await ctx.answerCbQuery('❌ Access denied');
        return;
      }

      const bannedUsers = await User.findAll({
        where: { is_banned: true },
        order: [['banned_at', 'DESC']],
        limit: 15
      });

      let message = `🚫 *Ban Management*\n\n` +
        `*Banned Users:* ${bannedUsers.length}\n\n`;

      if (bannedUsers.length === 0) {
        message += `No users are currently banned.`;
      } else {
        bannedUsers.forEach((user, index) => {
          const userInfo = user.username ? 
            `@${user.username} (${user.first_name})` : 
            `${user.first_name} (ID: ${user.telegram_id})`;
          
          message += `*${index + 1}.* ${userInfo}\n` +
            `   Banned: ${user.banned_at ? user.banned_at.toLocaleDateString() : 'Unknown'}\n` +
            `   Reason: ${user.ban_reason || 'Not specified'}\n\n`;
        });
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🚫 Ban User', 'platform_ban_user')],
        [Markup.button.callback('✅ Unban User', 'platform_unban_user')],
        [Markup.button.callback('🔙 Back to Dashboard', 'platform_dashboard')]
      ]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });

    } catch (error) {
      console.error('Ban management error:', error);
      await ctx.answerCbQuery('❌ Error loading ban list');
    }
  }

  // Start ban user process
  static async startBanUser(ctx) {
    try {
      if (!this.isPlatformCreator(ctx.from.id)) {
        await ctx.answerCbQuery('❌ Access denied');
        return;
      }

      platformAdminSessions.set(ctx.from.id, {
        action: 'ban_user',
        step: 'awaiting_user_id'
      });

      await ctx.editMessageText(
        `🚫 *Ban User*\n\n` +
        `Please provide the user's Telegram ID or username to ban:\n\n` +
        `*Examples:*\n` +
        `• 123456789 (User ID)\n` +
        `• @username\n\n` +
        `*Cancel:* Type /cancel`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🚫 Cancel', 'platform_bans')]
          ])
        }
      );

    } catch (error) {
      console.error('Start ban user error:', error);
      await ctx.answerCbQuery('❌ Error starting ban process');
    }
  }

  // Start unban user process
  static async startUnbanUser(ctx) {
    try {
      if (!this.isPlatformCreator(ctx.from.id)) {
        await ctx.answerCbQuery('❌ Access denied');
        return;
      }

      platformAdminSessions.set(ctx.from.id, {
        action: 'unban_user',
        step: 'awaiting_user_id'
      });

      await ctx.editMessageText(
        `✅ *Unban User*\n\n` +
        `Please provide the user's Telegram ID or username to unban:\n\n` +
        `*Examples:*\n` +
        `• 123456789 (User ID)\n` +
        `• @username\n\n` +
        `*Cancel:* Type /cancel`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🚫 Cancel', 'platform_bans')]
          ])
        }
      );

    } catch (error) {
      console.error('Start unban user error:', error);
      await ctx.answerCbQuery('❌ Error starting unban process');
    }
  }

  // Platform broadcast
  static async startPlatformBroadcast(ctx) {
    try {
      if (!this.isPlatformCreator(ctx.from.id)) {
        await ctx.answerCbQuery('❌ Access denied');
        return;
      }

      const totalUsers = await User.count();

      platformAdminSessions.set(ctx.from.id, {
        action: 'platform_broadcast',
        step: 'awaiting_message'
      });

      await ctx.editMessageText(
        `📢 *Platform Broadcast*\n\n` +
        `*Recipients:* ${formatNumber(totalUsers)} users\n\n` +
        `⚠️ *Important:* This will send a message to ALL users of the platform.\n\n` +
        `Please type your broadcast message:\n\n` +
        `*Cancel:* Type /cancel`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🚫 Cancel', 'platform_dashboard')]
          ])
        }
      );

    } catch (error) {
      console.error('Start platform broadcast error:', error);
      await ctx.answerCbQuery('❌ Error starting broadcast');
    }
  }

  // Send platform broadcast
  static async sendPlatformBroadcast(ctx, message) {
    try {
      if (!this.isPlatformCreator(ctx.from.id)) {
        await ctx.reply('❌ Access denied');
        return;
      }

      const users = await User.findAll({
        attributes: ['telegram_id', 'username', 'first_name'],
        where: { is_banned: false } // Don't send to banned users
      });

      const progressMsg = await ctx.reply(
        `📢 *Platform Broadcast Started*\n\n` +
        `🔄 Sending to ${formatNumber(users.length)} users...\n` +
        `✅ Sent: 0\n` +
        `❌ Failed: 0\n` +
        `⏰ Estimated time: ${Math.ceil(users.length / 20)} seconds`,
        { parse_mode: 'Markdown' }
      );

      let successCount = 0;
      let failCount = 0;
      const failedUsers = [];

      const startTime = Date.now();

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        try {
          await ctx.telegram.sendMessage(user.telegram_id, message, {
            parse_mode: 'Markdown'
          });
          successCount++;

          // Update progress every 20 users or every 5 seconds
          if (i % 20 === 0 || i === users.length - 1) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = Math.ceil((users.length - i) / 20);
            
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              progressMsg.message_id,
              null,
              `📢 *Platform Broadcast Progress*\n\n` +
              `🔄 Sending to ${formatNumber(users.length)} users...\n` +
              `✅ Sent: ${formatNumber(successCount)}\n` +
              `❌ Failed: ${formatNumber(failCount)}\n` +
              `⏰ Elapsed: ${elapsed}s | Remaining: ~${remaining}s`,
              { parse_mode: 'Markdown' }
            );
          }

          // Rate limiting: 30 messages per second max
          if (i % 30 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          failCount++;
          failedUsers.push({
            id: user.telegram_id,
            username: user.username,
            error: error.message
          });
          console.error(`Failed to send to user ${user.telegram_id}:`, error.message);
        }
      }

      const totalTime = Math.floor((Date.now() - startTime) / 1000);
      const successRate = ((successCount / users.length) * 100).toFixed(1);

      // Save broadcast history
      await BroadcastHistory.create({
        bot_id: null, // Platform broadcast
        sent_by: ctx.from.id,
        message: message.substring(0, 1000), // Limit message length
        total_users: users.length,
        successful_sends: successCount,
        failed_sends: failCount,
        broadcast_type: 'platform'
      });

      let resultMessage = `✅ *Platform Broadcast Completed!*\n\n` +
        `*Summary:*\n` +
        `👥 Total Recipients: ${formatNumber(users.length)}\n` +
        `✅ Successful: ${formatNumber(successCount)}\n` +
        `❌ Failed: ${formatNumber(failCount)}\n` +
        `📊 Success Rate: ${successRate}%\n` +
        `⏰ Total Time: ${totalTime} seconds\n\n`;

      if (failCount > 0) {
        resultMessage += `*Common failure reasons:*\n` +
          `• User blocked the bot\n` +
          `• User account deleted\n` +
          `• Rate limiting\n\n` +
          `Failed users: ${failedUsers.length}`;
      }

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMsg.message_id,
        null,
        resultMessage,
        { parse_mode: 'Markdown' }
      );

      platformAdminSessions.delete(ctx.from.id);

    } catch (error) {
      console.error('Send platform broadcast error:', error);
      await ctx.reply('❌ Error sending platform broadcast: ' + error.message);
      platformAdminSessions.delete(ctx.from.id);
    }
  }

  // Advanced analytics
  static async advancedAnalytics(ctx) {
    try {
      if (!this.isPlatformCreator(ctx.from.id)) {
        await ctx.answerCbQuery('❌ Access denied');
        return;
      }

      // Get analytics data for the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        newUsers,
        newBots,
        activeUsers,
        messagesStats
      ] = await Promise.all([
        User.count({
          where: {
            created_at: { [require('sequelize').Op.gte]: thirtyDaysAgo }
          }
        }),
        Bot.count({
          where: {
            created_at: { [require('sequelize').Op.gte]: thirtyDaysAgo }
          }
        }),
        User.count({
          where: {
            last_active: { [require('sequelize').Op.gte]: thirtyDaysAgo }
          }
        }),
        Feedback.findAll({
          where: {
            created_at: { [require('sequelize').Op.gte]: thirtyDaysAgo }
          },
          attributes: [
            [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'total'],
            [require('sequelize').fn('SUM', require('sequelize').literal('CASE WHEN is_replied = true THEN 1 ELSE 0 END')), 'replied']
          ],
          raw: true
        })
      ]);

      const totalMessages = parseInt(messagesStats[0]?.total || 0);
      const repliedMessages = parseInt(messagesStats[0]?.replied || 0);
      const replyRate = totalMessages > 0 ? ((repliedMessages / totalMessages) * 100).toFixed(1) : 0;

      const analyticsMessage = `📊 *Advanced Analytics* (Last 30 Days)\n\n` +
        `*User Growth:*\n` +
        `👥 New Users: ${formatNumber(newUsers)}\n` +
        `👥 Active Users: ${formatNumber(activeUsers)}\n\n` +
        `*Bot Activity:*\n` +
        `🤖 New Bots: ${formatNumber(newBots)}\n\n` +
        `*Messaging:*\n` +
        `💬 Total Messages: ${formatNumber(totalMessages)}\n` +
        `✅ Replied Messages: ${formatNumber(repliedMessages)}\n` +
        `📊 Reply Rate: ${replyRate}%\n\n` +
        `*Platform Health:*\n` +
        `🟢 System: Operational\n` +
        `📈 Trend: Growing`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📈 Detailed Reports', 'platform_detailed_reports')],
        [Markup.button.callback('🔙 Back to Dashboard', 'platform_dashboard')]
      ]);

      await ctx.editMessageText(analyticsMessage, {
        parse_mode: 'Markdown',
        ...keyboard
      });

    } catch (error) {
      console.error('Advanced analytics error:', error);
      await ctx.answerCbQuery('❌ Error loading analytics');
    }
  }

  // Handle platform admin text input
  static async handlePlatformAdminInput(ctx) {
    try {
      const userId = ctx.from.id;
      const session = platformAdminSessions.get(userId);

      if (!session) return;

      if (ctx.message.text === '/cancel') {
        platformAdminSessions.delete(userId);
        await ctx.reply('❌ Platform admin action cancelled.');
        return;
      }

      const input = ctx.message.text.trim();

      if (session.action === 'platform_broadcast' && session.step === 'awaiting_message') {
        await this.sendPlatformBroadcast(ctx, input);
      } else if ((session.action === 'ban_user' || session.action === 'unban_user') && session.step === 'awaiting_user_id') {
        await this.processUserBanAction(ctx, session.action, input);
      }

      platformAdminSessions.delete(userId);

    } catch (error) {
      console.error('Platform admin input error:', error);
      await ctx.reply('❌ Error processing platform admin action.');
      platformAdminSessions.delete(ctx.from.id);
    }
  }

  // Process user ban/unban action
  static async processUserBanAction(ctx, action, input) {
    try {
      let targetUserId;
      let targetUser;

      // Parse user input
      if (/^\d+$/.test(input)) {
        targetUserId = parseInt(input);
        targetUser = await User.findOne({ where: { telegram_id: targetUserId } });
      } else {
        const username = input.replace('@', '').trim();
        targetUser = await User.findOne({ where: { username: username } });
        if (targetUser) {
          targetUserId = targetUser.telegram_id;
        }
      }

      if (!targetUser) {
        await ctx.reply('❌ User not found. Please check the User ID or username.');
        return;
      }

      if (action === 'ban_user') {
        if (targetUser.is_banned) {
          await ctx.reply('❌ This user is already banned.');
          return;
        }

        await targetUser.update({
          is_banned: true,
          banned_at: new Date(),
          ban_reason: 'Banned by platform admin'
        });

        await ctx.reply(`✅ User @${targetUser.username || targetUser.telegram_id} has been banned.`);

      } else if (action === 'unban_user') {
        if (!targetUser.is_banned) {
          await ctx.reply('❌ This user is not banned.');
          return;
        }

        await targetUser.update({
          is_banned: false,
          banned_at: null,
          ban_reason: null
        });

        await ctx.reply(`✅ User @${targetUser.username || targetUser.telegram_id} has been unbanned.`);
      }

      // Return to ban management
      await this.banManagement(ctx);

    } catch (error) {
      console.error('Process user ban action error:', error);
      await ctx.reply('❌ Error processing ban action.');
    }
  }

  // Check if user is in platform admin session
  static isInPlatformAdminSession(userId) {
    return platformAdminSessions.has(userId);
  }
}

// Register platform admin callbacks
PlatformAdminHandler.registerCallbacks = (bot) => {
  // Dashboard and main navigation
  bot.action('platform_dashboard', async (ctx) => {
    await PlatformAdminHandler.platformDashboard(ctx);
  });

  bot.action('platform_users', async (ctx) => {
    await PlatformAdminHandler.userManagement(ctx, 1);
  });

  bot.action('platform_bots', async (ctx) => {
    await PlatformAdminHandler.botManagement(ctx, 1);
  });

  bot.action('platform_broadcast', async (ctx) => {
    await PlatformAdminHandler.startPlatformBroadcast(ctx);
  });

  bot.action('platform_bans', async (ctx) => {
    await PlatformAdminHandler.banManagement(ctx);
  });

  bot.action('platform_analytics', async (ctx) => {
    await PlatformAdminHandler.advancedAnalytics(ctx);
  });

  // User management pagination
  bot.action(/platform_users:(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    await PlatformAdminHandler.userManagement(ctx, page);
  });

  // Bot management pagination
  bot.action(/platform_bots:(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    await PlatformAdminHandler.botManagement(ctx, page);
  });

  // Ban management actions
  bot.action('platform_ban_user', async (ctx) => {
    await PlatformAdminHandler.startBanUser(ctx);
  });

  bot.action('platform_unban_user', async (ctx) => {
    await PlatformAdminHandler.startUnbanUser(ctx);
  });

  // Analytics and stats
  bot.action('platform_user_stats', async (ctx) => {
    await ctx.answerCbQuery('📊 User statistics feature coming soon!');
  });

  bot.action('platform_detailed_reports', async (ctx) => {
    await ctx.answerCbQuery('📈 Detailed reports feature coming soon!');
  });

  // Bot management actions
  bot.action('platform_toggle_bot', async (ctx) => {
    await ctx.answerCbQuery('🔄 Bot toggle feature coming soon!');
  });

  bot.action('platform_delete_bot', async (ctx) => {
    await ctx.answerCbQuery('🗑️ Bot deletion feature coming soon!');
  });

  // Export features
  bot.action('platform_export_users', async (ctx) => {
    await ctx.answerCbQuery('📋 User export feature coming soon!');
  });
};

module.exports = PlatformAdminHandler;