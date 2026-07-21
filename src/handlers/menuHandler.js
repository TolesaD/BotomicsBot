// src/handlers/menuHandler.js - Central Menu Navigation Handler
const { Markup } = require("telegraf");
const MenuBuilder = require("../utils/menuBuilder");
const SessionManager = require("../utils/sessionManager");
const { startHandler } = require("./startHandler");
const { myBotsHandler } = require("./myBotsHandler");
const WalletHandler = require("./walletHandler");

class MenuHandler {
  constructor() {
    this.menus = {
      main: this.mainMenu.bind(this),
      myBots: this.myBotsMenu.bind(this),
      botManagement: this.botManagementMenu.bind(this),
      wallet: this.walletMenu.bind(this),
      settings: this.settingsMenu.bind(this),
      help: this.helpMenu.bind(this),
    };
  }

  /**
   * Handle menu navigation
   */
  async handleMenu(ctx, action, data = null) {
    try {
      const userId = ctx.from.id;

      // Update session
      SessionManager.setSession(userId, {
        menu: action,
        action: action,
        context: data || {},
      });

      // Handle menu actions
      switch (action) {
        case "main":
        case "start":
          await this.mainMenu(ctx);
          break;
        case "my_bots":
          await this.myBotsMenu(ctx);
          break;
        case "bot_management":
          await this.botManagementMenu(ctx, data);
          break;
        case "wallet":
        case "wallet_main":
          await this.walletMenu(ctx);
          break;
        case "settings":
          await this.settingsMenu(ctx);
          break;
        case "help":
          await this.helpMenu(ctx);
          break;
        case "back":
          await this.goBack(ctx);
          break;
        default:
          await this.mainMenu(ctx);
      }

      await ctx.answerCbQuery?.();
    } catch (error) {
      console.error("Menu handler error:", error);
      await ctx.reply("❌ Error loading menu. Please try again.");
    }
  }

  /**
   * Main Menu
   */
  async mainMenu(ctx) {
    const welcomeMessage =
      `🤖 *Botomics Platform*\n\n` +
      `*Welcome to the Ultimate Bot Management Platform!*\n\n` +
      `🎯 Create and manage Telegram bots without coding.\n` +
      `📊 All management happens directly in your mini-bots.\n\n` +
      `*Choose an option below:*`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("🚀 Create Bot", "create_bot")],
      [Markup.button.callback("🤖 My Bots", "my_bots")],
      [Markup.button.callback("💰 Wallet", "wallet_main")],
      [Markup.button.callback("⚙️ Settings", "settings_menu")],
      [Markup.button.callback("❓ Help", "help")],
    ]);

    await this.render(ctx, welcomeMessage, keyboard);
  }

  /**
   * My Bots Menu
   */
  async myBotsMenu(ctx) {
    await myBotsHandler(ctx);
  }

  /**
   * Wallet Menu
   */
  async walletMenu(ctx) {
    await WalletHandler.handleWalletCommand(ctx);
  }

  /**
   * Settings Menu
   */
  async settingsMenu(ctx) {
    const message =
      `⚙️ *Settings*\n\n` +
      `*Account Settings:*\n` +
      `• Language: English\n` +
      `• Notifications: Enabled\n` +
      `• Privacy: View Policy\n\n` +
      `*Bot Settings:*\n` +
      `• Default welcome message\n` +
      `• Default response\n` +
      `• Auto-reply settings\n\n` +
      `*Choose an option:*`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("🔔 Notifications", "settings_notifications")],
      [Markup.button.callback("🌐 Language", "settings_language")],
      [Markup.button.callback("🔒 Privacy", "privacy_policy")],
      [Markup.button.callback("🔙 Back", "start")],
    ]);

    await this.render(ctx, message, keyboard);
  }

  /**
   * Help Menu
   */
  async helpMenu(ctx) {
    const message =
      `❓ *Help Center*\n\n` +
      `*Quick Guide:*\n` +
      `1. Create a bot with @BotFather\n` +
      `2. Use /createbot in this bot\n` +
      `3. Manage your bot from its own dashboard\n\n` +
      `*Common Commands:*\n` +
      `/start - Main menu\n` +
      `/createbot - Create new bot\n` +
      `/mybots - View your bots\n` +
      `/wallet - Manage wallet\n\n` +
      `*Need help?* Contact @BotomicsSupportBot`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("📖 Full Guide", "help_full")],
      [Markup.button.callback("📞 Support", "contact_support")],
      [Markup.button.callback("🔙 Back", "start")],
    ]);

    await this.render(ctx, message, keyboard);
  }

  /**
   * Bot Management Menu
   */
  async botManagementMenu(ctx, botId) {
    const Bot = require("../models/Bot");
    const bot = await Bot.findByPk(botId);

    if (!bot) {
      await ctx.reply("❌ Bot not found");
      return;
    }

    const message =
      `🤖 *${bot.bot_name}*\n\n` +
      `*Status:* ${bot.is_active ? "🟢 Active" : "🔴 Inactive"}\n` +
      `*Username:* @${bot.bot_username}\n\n` +
      `*Manage your bot:*`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("📊 Dashboard", `bot_dashboard_${botId}`)],
      [Markup.button.callback("⚙️ Settings", `settings_${botId}`)],
      [Markup.button.callback("📢 Broadcast", `broadcast_${botId}`)],
      [Markup.button.callback("🔙 Back", "my_bots")],
    ]);

    await this.render(ctx, message, keyboard);
  }

  /**
   * Go back to previous menu
   */
  async goBack(ctx) {
    const userId = ctx.from.id;
    const session = SessionManager.goBack(userId);

    if (session && session.menu) {
      await this.handleMenu(ctx, session.menu, session.context);
    } else {
      await this.mainMenu(ctx);
    }
  }

  /**
   * Render message with keyboard
   */
  async render(ctx, message, keyboard = null) {
    try {
      if (ctx.updateType === "callback_query" && ctx.callbackQuery?.message) {
        await ctx.editMessageText(message, {
          parse_mode: "Markdown",
          ...keyboard,
        });
      } else {
        await ctx.replyWithMarkdown(message, keyboard);
      }
    } catch (error) {
      if (error.description?.includes("message is not modified")) {
        await ctx.answerCbQuery?.();
      } else {
        console.error("Render error:", error);
        await ctx.reply(message);
      }
    }
  }

  /**
   * Helper: Get bot count
   */
  async getBotCount(userId) {
    try {
      const { Bot } = require("../models");
      return await Bot.count({ where: { owner_id: userId, is_active: true } });
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Get wallet balance
   */
  async getWalletBalance(userId) {
    try {
      const WalletService = require("../services/walletService");
      const wallet = await WalletService.getBalance(userId);
      return wallet.balance.toFixed(0);
    } catch {
      return "0";
    }
  }
}

module.exports = new MenuHandler();
