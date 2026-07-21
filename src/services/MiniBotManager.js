// src/services/MiniBotManager.js - COMPLETE WITH WEBHOOKS & NEW FEATURES
const { Telegraf, Markup } = require("telegraf");
const {
  Bot,
  UserLog,
  Feedback,
  Admin,
  User,
  BroadcastHistory,
  ProductCatalog,
  ProductOrder,
} = require("../models");
const ReferralHandler = require("../handlers/referralHandler");

// Import new feature handlers
const ChannelJoinHandler = require("../handlers/channelJoinHandler");
const BanHandler = require("../handlers/banHandler");
const banCheckMiddleware = require("../middleware/banCheck");

// Import Botomics services
const WalletService = require("./walletService");
const SubscriptionService = require("./subscriptionService");
const BotCleanupService = require("./BotCleanupService");

// ========== PUBLIC_URL DEFINITION ==========
const getPublicUrl = () => {
  const cleanUrl = (url) => {
    if (!url) return url;
    let cleanUrl = url.toString().trim();
    cleanUrl = cleanUrl.replace(/^https?:\/\//i, "");
    cleanUrl = cleanUrl.replace(/\/$/, "");
    return `https://${cleanUrl}`;
  };

  if (process.env.RENDER_EXTERNAL_URL) {
    const url = cleanUrl(process.env.RENDER_EXTERNAL_URL);
    console.log(`🚀 MiniBotManager: Using RENDER_EXTERNAL_URL: ${url}`);
    return url;
  }
  if (process.env.RAILWAY_STATIC_URL) {
    const url = cleanUrl(process.env.RAILWAY_STATIC_URL);
    console.log(`🚀 MiniBotManager: Using RAILWAY_STATIC_URL: ${url}`);
    return url;
  }
  if (process.env.PUBLIC_URL) {
    const url = cleanUrl(process.env.PUBLIC_URL);
    console.log(`🚀 MiniBotManager: Using PUBLIC_URL: ${url}`);
    return url;
  }
  const fallbackUrl = "https://botomics.onrender.com";
  console.log(`⚠️ MiniBotManager: Using fallback URL: ${fallbackUrl}`);
  return fallbackUrl;
};

const PUBLIC_URL = getPublicUrl();
console.log(`🌐 MiniBotManager: PUBLIC_URL = ${PUBLIC_URL}`);

class MiniBotManager {
  constructor() {
    this.activeBots = new Map();
    this.broadcastSessions = new Map();
    this.replySessions = new Map();
    this.adminSessions = new Map();
    this.messageFlowSessions = new Map();
    this.welcomeMessageSessions = new Map();

    this.referralSessions = new Map();
    this.currencySessions = new Map();
    this.transferOwnershipSessions = new Map();
    this.donationSessions = new Map();
    this.adSessions = new Map();
    this.productCatalogSessions = new Map();

    this.ongoingBroadcasts = new Map();

    // Performance optimizations
    this.buttonResponseCache = new Map();
    this.userSessionCache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    this.isDevelopment =
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "dev" ||
      process.env.DEV_MODE === "true" ||
      process.env.TEST_MODE === "true";

    this.mainBotUsername = this.isDevelopment
      ? process.env.MAIN_BOT_USERNAME || "BotomicsDevBot"
      : "BotomicsBot";
    this.mainBotDisplayName = this.isDevelopment
      ? "🤖 Botomics DEV"
      : "🤖 Botomics";

    // Webhook settings
    this.WEBHOOK_BATCH_SIZE = 20;
    this.WEBHOOK_DELAY = 500;

    console.log(
      `🚀 MiniBotManager initialized for ${this.isDevelopment ? "DEVELOPMENT" : "PRODUCTION"} environment`,
    );
    console.log(`🔍 Using main bot: @${this.mainBotUsername}`);
    console.log(`🔗 Webhook URL: ${PUBLIC_URL}/webhook`);
  }

  // ========== CACHE HELPERS ==========
  getCachedResponse(userId, action) {
    const key = `${userId}_${action}`;
    const cached = this.buttonResponseCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  setCachedResponse(userId, action, data) {
    const key = `${userId}_${action}`;
    this.buttonResponseCache.set(key, {
      data,
      timestamp: Date.now(),
    });
    this.cleanCache();
  }

  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.buttonResponseCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.buttonResponseCache.delete(key);
      }
    }
  }

  // ========== SETUP WEBHOOKS FOR ALL BOTS ==========
  async initializeAllBots() {
    if (this.initializationPromise) {
      console.log("🔄 Initialization already in progress, waiting...");
      return this.initializationPromise;
    }

    this.initializationPromise = this._initializeAllBots();
    const result = await this.initializationPromise;
    this.initializationPromise = null;
    return result;
  }

  async _initializeAllBots() {
    try {
      console.log(`🔄 Setting up WEBHOOKS for all mini-bots...`);

      await this.clearAllBots();

      console.log("⏳ Waiting for database...");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("🧹 Running cleanup before initialization...");
      await BotCleanupService.runFullCleanup();

      const activeBots = await Bot.findAll({ where: { is_active: true } });

      console.log(`📊 Found ${activeBots.length} active bots to configure`);

      if (activeBots.length === 0) {
        console.log("ℹ️ No active bots found");
        this.isInitialized = true;
        return 0;
      }

      let successCount = 0;
      let failedCount = 0;

      const batchSize = this.WEBHOOK_BATCH_SIZE;
      const totalBatches = Math.ceil(activeBots.length / batchSize);

      console.log(
        `🚀 Setting up webhooks for ${activeBots.length} bots in ${totalBatches} batches (${batchSize} per batch)`,
      );

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, activeBots.length);
        const batch = activeBots.slice(start, end);

        console.log(
          `\n📦 Batch ${batchIndex + 1}/${totalBatches}: ${batch.length} bots`,
        );

        const batchPromises = batch.map(async (botRecord, indexInBatch) => {
          const botNumber = start + indexInBatch + 1;

          try {
            const owner = await User.findOne({
              where: { telegram_id: botRecord.owner_id },
            });
            if (owner && owner.is_banned) {
              console.log(
                `🚫 [${botNumber}/${activeBots.length}] ${botRecord.bot_name} - owner banned`,
              );
              await botRecord.update({ is_active: false });
              return {
                success: false,
                botName: botRecord.bot_name,
                reason: "Owner banned",
              };
            }

            const token = botRecord.getDecryptedToken();
            if (!token || !this.isValidBotToken(token)) {
              console.log(
                `❌ [${botNumber}/${activeBots.length}] ${botRecord.bot_name} - invalid token`,
              );
              await BotCleanupService.removeBotWithData(
                botRecord.id,
                "Invalid token",
              );
              return {
                success: false,
                botName: botRecord.bot_name,
                reason: "Invalid token",
              };
            }

            const success = await this.setupWebhookForBot(
              botRecord,
              botNumber,
              activeBots.length,
            );

            if (success) {
              successCount++;
              console.log(
                `✅ [${botNumber}/${activeBots.length}] SUCCESS: ${botRecord.bot_name}`,
              );
            } else {
              failedCount++;
              console.log(
                `❌ [${botNumber}/${activeBots.length}] FAILED: ${botRecord.bot_name}`,
              );
            }

            return { success, botName: botRecord.bot_name };
          } catch (error) {
            failedCount++;
            console.error(
              `💥 [${botNumber}/${activeBots.length}] ERROR: ${botRecord.bot_name} - ${error.message}`,
            );
            return {
              success: false,
              botName: botRecord.bot_name,
              reason: error.message,
            };
          }
        });

        await Promise.allSettled(batchPromises);

        const completed = Math.min(
          (batchIndex + 1) * batchSize,
          activeBots.length,
        );
        const progressPercent = ((completed / activeBots.length) * 100).toFixed(
          1,
        );
        console.log(
          `📊 ${progressPercent}% complete (${completed}/${activeBots.length}) | ✅ ${successCount} | ❌ ${failedCount}`,
        );

        if (batchIndex < totalBatches - 1) {
          console.log(
            `⏳ Waiting ${this.WEBHOOK_DELAY}ms before next batch...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, this.WEBHOOK_DELAY),
          );
        }
      }

      console.log(
        `\n🎉 WEBHOOK SETUP COMPLETE: ${successCount} success, ${failedCount} failed`,
      );

      await this._createBotInstances(activeBots);
      await this.updateAllBotCounts();

      this.isInitialized = true;
      this.debugActiveBots();

      return successCount;
    } catch (error) {
      console.error("💥 CRITICAL: Error setting up webhooks:", error);
      this.isInitialized = false;
      return 0;
    }
  }

  // ========== VALIDATE BOT TOKEN ==========
  async validateBotToken(botRecord) {
    try {
      const token = botRecord.getDecryptedToken();
      if (!token) return false;

      const response = await fetch(
        `https://api.telegram.org/bot${token}/getMe`,
      );
      const data = await response.json();

      if (!data.ok) {
        console.log(
          `   ❌ Token invalid for ${botRecord.bot_name}: ${data.description}`,
        );
        return false;
      }

      await botRecord.update({
        token_valid: true,
        token_last_checked: new Date(),
      });

      return true;
    } catch (error) {
      console.log(
        `   ⚠️ Token check error for ${botRecord.bot_name}: ${error.message}`,
      );
      return false;
    }
  }

  // ========== SETUP WEBHOOK FOR A SINGLE BOT ==========
  async setupWebhookForBot(botRecord, botNumber, totalBots) {
    try {
      const token = botRecord.getDecryptedToken();
      if (!token || !this.isValidBotToken(token)) {
        return false;
      }

      const webhookUrl = `${PUBLIC_URL}/webhook/${botRecord.id}`;

      console.log(
        `   Setting webhook for ${botRecord.bot_name}: ${webhookUrl}`,
      );

      const response = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: [
              "message",
              "callback_query",
              "edited_message",
              "inline_query",
              "chosen_inline_result",
              "shipping_query",
              "pre_checkout_query",
              "poll",
              "poll_answer",
              "my_chat_member",
              "chat_member",
              "chat_join_request",
            ],
            drop_pending_updates: true,
            max_connections: 100,
          }),
        },
      );

      const data = await response.json();

      if (!data.ok) {
        console.error(
          `   ❌ Webhook failed for ${botRecord.bot_name}: ${data.description}`,
        );
        return false;
      }

      console.log(`   ✅ Webhook set for ${botRecord.bot_name}`);

      const bot = new Telegraf(token, {
        handlerTimeout: 90000,
        telegram: {
          apiRoot: "https://api.telegram.org",
          agent: null,
          timeout: 30000,
        },
      });

      const botRef = this.getBotReference(botRecord.bot_name);

      bot.context.metaBotInfo = {
        mainBotId: botRecord.id,
        botId: botRecord.bot_id,
        botName: botRef.fullName,
        botUsername: botRecord.bot_username,
        botRecord: botRecord,
        environment: this.isDevelopment ? "development" : "production",
        mainBotRef: botRef,
      };

      this.setupHandlers(bot);

      this.activeBots.set(botRecord.id, {
        instance: bot,
        record: botRecord,
        token: token,
        launchedAt: new Date(),
        status: "active",
        environment: this.isDevelopment ? "development" : "production",
      });

      await botRecord.update({ last_activity: new Date() });

      return true;
    } catch (error) {
      console.error(
        `❌ Failed to setup webhook for ${botRecord.bot_name}:`,
        error.message,
      );
      return false;
    }
  }

  // ========== CREATE BOT INSTANCES ==========
  async _createBotInstances(activeBots) {
    console.log("\n🔄 Creating bot instances for webhook handling...");

    let successCount = 0;

    for (const botRecord of activeBots) {
      try {
        if (this.activeBots.has(botRecord.id)) continue;

        const token = botRecord.getDecryptedToken();
        if (!token || !this.isValidBotToken(token)) {
          continue;
        }

        const bot = new Telegraf(token, {
          handlerTimeout: 90000,
          telegram: {
            apiRoot: "https://api.telegram.org",
            agent: null,
            timeout: 30000,
          },
        });

        const botRef = this.getBotReference(botRecord.bot_name);

        bot.context.metaBotInfo = {
          mainBotId: botRecord.id,
          botId: botRecord.bot_id,
          botName: botRef.fullName,
          botUsername: botRecord.bot_username,
          botRecord: botRecord,
          environment: this.isDevelopment ? "development" : "production",
          mainBotRef: botRef,
        };

        this.setupHandlers(bot);

        this.activeBots.set(botRecord.id, {
          instance: bot,
          record: botRecord,
          token: token,
          launchedAt: new Date(),
          status: "active",
          environment: this.isDevelopment ? "development" : "production",
        });

        successCount++;
      } catch (error) {
        console.error(
          `❌ Failed to create instance for ${botRecord.bot_name}:`,
          error.message,
        );
      }
    }

    console.log(
      `✅ Created ${successCount} bot instances for webhook handling`,
    );
  }

  // ========== UPDATE ALL BOT COUNTS ==========
  async updateAllBotCounts() {
    try {
      const bots = await Bot.findAll({ where: { is_active: true } });

      for (const bot of bots) {
        const userCount = await UserLog.count({ where: { bot_id: bot.id } });
        await bot.update({ user_count: userCount });
      }

      console.log(`✅ Updated user counts for ${bots.length} bots`);
    } catch (error) {
      console.error("❌ Failed to update bot counts:", error.message);
    }
  }

  // ========== HANDLE WEBHOOK REQUEST ==========
  async handleWebhook(req, res, botId) {
    try {
      const botData = this.activeBots.get(parseInt(botId));

      if (!botData) {
        console.error(`❌ Bot instance not found for ID: ${botId}`);
        return res.status(404).json({ error: "Bot not found" });
      }

      const bot = botData.instance;
      const update = req.body;

      Bot.update(
        { last_activity: new Date() },
        { where: { id: parseInt(botId) } },
      ).catch((err) => console.error("Failed to update last activity:", err));

      await bot.handleUpdate(update, res);
    } catch (error) {
      console.error(`❌ Webhook error for bot ${botId}:`, error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // ========== CHECK WEBHOOK STATUS ==========
  async checkWebhookStatus(botId) {
    try {
      const botData = this.activeBots.get(parseInt(botId));
      if (!botData) {
        return null;
      }

      const token = botData.token;
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getWebhookInfo`,
      );
      return await response.json();
    } catch (error) {
      console.error(
        `❌ Failed to check webhook for bot ${botId}:`,
        error.message,
      );
      return null;
    }
  }

  // ========== LEGACY METHODS ==========
  async initializeBot(botRecord) {
    return this.setupWebhookForBot(botRecord, 0, 1);
  }

  isValidBotToken(token) {
    if (!token || typeof token !== "string") return false;
    const tokenPattern = /^\d+:[a-zA-Z0-9_-]+$/;
    return tokenPattern.test(token);
  }

  // ========== HELPER METHODS ==========
  getBotReference(botName = "") {
    const envSuffix = this.isDevelopment ? " 🚧 DEV" : "";
    return {
      username: this.mainBotUsername,
      displayName: this.mainBotDisplayName,
      fullName: `${botName}${envSuffix}`,
      isDevelopment: this.isDevelopment,
      supportBot: this.isDevelopment
        ? "BotomicsDevSupportBot"
        : "BotomicsSupportBot",
    };
  }

  async clearAllBots() {
    console.log("🔄 Clearing all existing bot instances...");
    const botIds = Array.from(this.activeBots.keys());
    for (const botId of botIds) {
      try {
        const botData = this.activeBots.get(botId);
        if (botData && botData.instance) {
          await botData.instance.stop();
        }
        this.activeBots.delete(botId);
      } catch (error) {
        console.error(`Error stopping bot ${botId}:`, error);
      }
    }
    console.log(`✅ Cleared ${botIds.length} bot instances`);
  }

  async stopBot(botId) {
    try {
      const botData = this.activeBots.get(botId);
      if (botData && botData.instance) {
        console.log(`🛑 Stopping bot ${botId}...`);
        await botData.instance.stop();
        this.activeBots.delete(botId);
        console.log(`✅ Bot ${botId} stopped`);
      }
    } catch (error) {
      console.error(`Error stopping bot ${botId}:`, error);
    }
  }

  getBotInstanceByDbId = (dbId) => {
    const botData = this.activeBots.get(parseInt(dbId));
    if (!botData) return null;
    return botData.instance;
  };

  debugActiveBots = () => {
    console.log("\n🐛 DEBUG: Active Bots Status");
    console.log(`📊 Total active bots: ${this.activeBots.size}`);
    console.log(
      `🏁 Initialization status: ${this.isInitialized ? "COMPLETE" : "PENDING"}`,
    );
    console.log(
      `🌍 Environment: ${this.isDevelopment ? "DEVELOPMENT 🚧" : "PRODUCTION 🚀"}`,
    );
    console.log(`🔗 Webhook Mode: ENABLED`);

    if (this.activeBots.size === 0) {
      console.log("❌ No active bots found in memory!");
    } else {
      let count = 0;
      for (const [dbId, botData] of this.activeBots.entries()) {
        if (count < 10) {
          console.log(
            `🤖 ${botData.record.bot_name} | DB: ${dbId} | Status: ${botData.status}`,
          );
        }
        count++;
      }
      if (this.activeBots.size > 10) {
        console.log(`... and ${this.activeBots.size - 10} more bots`);
      }
    }
  };

  getInitializationStatus() {
    return {
      isInitialized: this.isInitialized,
      activeBots: this.activeBots.size,
      status: this.isInitialized ? "READY" : "INITIALIZING",
      environment: this.isDevelopment ? "development" : "production",
      mainBot: this.mainBotUsername,
      mode: "webhooks",
      cacheSize: this.buttonResponseCache.size,
    };
  }

  async forceReinitializeAllBots() {
    console.log("🔄 FORCE: Reinitializing all mini-bots...");
    this.isInitialized = false;
    return await this.initializeAllBots();
  }

  healthCheck = () => {
    return {
      isHealthy: this.isInitialized && !this.initializationPromise,
      activeBots: this.activeBots.size,
      status: this.isInitialized ? "READY" : "INITIALIZING",
      environment: this.isDevelopment ? "development" : "production",
      mainBot: this.mainBotUsername,
      mode: "webhooks",
      cacheSize: this.buttonResponseCache.size,
    };
  };

  // ========== HANDLERS SETUP - FAST RESPONSE OPTIMIZED ==========
  setupHandlers = (bot) => {
    console.log("🔄 Setting up handlers for bot...");

    // ========== NATIVE TELEGRAM EDIT HANDLER ==========
    bot.on("edited_message", async (ctx) => {
      await this.handleNativeMessageEdit(ctx);
    });

    // ========== REGISTER CALLBACKS ==========
    ReferralHandler.registerCallbacks(bot);
    ChannelJoinHandler.registerCallbacks(bot);

    // ========== CHANNEL VERIFICATION MIDDLEWARE ==========
    bot.use(async (ctx, next) => {
      try {
        const { metaBotInfo } = ctx;
        if (!metaBotInfo || !ctx.from) {
          return next();
        }

        const isAdmin = await this.checkAdminAccess(
          metaBotInfo.mainBotId,
          ctx.from.id,
        );
        if (isAdmin) {
          return next();
        }

        if (ctx.message?.text?.startsWith("/start ref-")) {
          return next();
        }

        if (
          ctx.message?.text?.startsWith("/catalog") ||
          ctx.callbackQuery?.data?.startsWith("catalog_") ||
          ctx.callbackQuery?.data?.startsWith("product_") ||
          ctx.callbackQuery?.data?.startsWith("order_")
        ) {
          return next();
        }

        const membershipCheck = await ChannelJoinHandler.checkChannelMembership(
          ctx,
          metaBotInfo.mainBotId,
          ctx.from.id,
        );

        if (membershipCheck.required && !membershipCheck.joined) {
          console.log(`🔒 User ${ctx.from.id} needs to join channels`);
          await ChannelJoinHandler.showJoinWall(
            ctx,
            metaBotInfo,
            membershipCheck,
          );
          return;
        }

        return next();
      } catch (error) {
        console.error("Channel verification middleware error:", error);
        return next();
      }
    });

    // ========== BAN CHECK MIDDLEWARE ==========
    bot.use(banCheckMiddleware);

    // ========== MAIN MIDDLEWARE ==========
    bot.use(async (ctx, next) => {
      ctx.miniBotManager = this;

      if (ctx.updateType === "callback_query") {
        return next();
      }

      if (
        ctx.message?.text &&
        (await BanHandler.handleBanTextInput(ctx, ctx.message.text))
      ) {
        return;
      }

      if (
        ctx.message?.text &&
        (await ChannelJoinHandler.handleChannelTextInput(ctx, ctx.message.text))
      ) {
        return;
      }

      if (
        ctx.message?.text &&
        (await ReferralHandler.processReferralSettingChange(
          ctx,
          ctx.metaBotInfo?.mainBotId,
          ctx.message.text,
        ))
      ) {
        return;
      }

      if (ctx.from) {
        const user = await User.findOne({
          where: { telegram_id: ctx.from.id },
        });
        if (user && user.is_banned) {
          console.log(
            `🚫 Banned user ${ctx.from.id} tried to access bot ${ctx.metaBotInfo?.botName}`,
          );
          await ctx.reply(
            "🚫 Your account has been banned from using this platform.",
          );
          return;
        }
      }

      if (ctx.from && ctx.metaBotInfo) {
        await this.setBotCommands(bot, null, ctx.from.id);
      }

      return next();
    });

    // ========== OPTIMIZED START COMMAND ==========
    bot.start(async (ctx) => {
      try {
        const startPayload = ctx.payload;
        if (startPayload && startPayload.startsWith("ref-")) {
          const referralCode = startPayload.replace("ref-", "");
          await ReferralHandler.handleReferralStart(ctx, referralCode);
        }

        await this.handleStart(ctx);
      } catch (error) {
        console.error("Start with referral error:", error);
        await this.handleStart(ctx);
      }
    });

    // ========== MAIN COMMANDS ==========
    bot.command("dashboard", (ctx) => this.handleDashboard(ctx));
    bot.command("broadcast", (ctx) => this.handleBroadcastCommand(ctx));
    bot.command("stats", (ctx) => this.handleStatsCommand(ctx));
    bot.command("admins", (ctx) => this.handleAdminsCommand(ctx));
    bot.command("settings", (ctx) => this.handleSettingsCommand(ctx));
    bot.command("help", (ctx) => this.handleHelp(ctx));

    bot.command("referral", async (ctx) => {
      try {
        const { metaBotInfo } = ctx;
        const isAdmin = await this.checkAdminAccess(
          metaBotInfo.mainBotId,
          ctx.from.id,
        );

        if (isAdmin) {
          await ReferralHandler.showReferralManagement(
            ctx,
            metaBotInfo.mainBotId,
          );
        } else {
          await ReferralHandler.showReferralDashboard(
            ctx,
            metaBotInfo.mainBotId,
          );
        }
      } catch (error) {
        console.error("Referral command error:", error);
        await ctx.reply("❌ Error loading referral program.");
      }
    });

    bot.command("ban", async (ctx) => {
      try {
        const args = ctx.message.text.split(" ").slice(1);
        if (args.length < 1) {
          await ctx.reply(
            "❌ <b>Usage: /ban &lt;username_or_id&gt; [reason]</b>\n\n" +
              "<b>Examples:</b>\n" +
              "/ban @username Spamming messages\n" +
              "/ban 123456789 Violating rules\n" +
              "/ban @username",
            { parse_mode: "HTML" },
          );
          return;
        }

        const userIdentifier = args[0];
        const reason = args.slice(1).join(" ") || "No reason provided";

        await BanHandler.handleBanCommand(ctx, userIdentifier, reason);
      } catch (error) {
        console.error("Ban command error:", error);
        await ctx.reply(
          "❌ Error processing ban command. Usage: /ban <username_or_id> [reason]",
        );
      }
    });

    bot.command("unban", async (ctx) => {
      try {
        const args = ctx.message.text.split(" ").slice(1);
        if (args.length < 1) {
          await ctx.reply(
            "❌ <b>Usage: /unban &lt;username_or_id&gt;</b>\n\n" +
              "<b>Examples:</b>\n" +
              "/unban @username\n" +
              "/unban 123456789",
            { parse_mode: "HTML" },
          );
          return;
        }

        const userIdentifier = args[0];
        await BanHandler.handleUnbanCommand(ctx, userIdentifier);
      } catch (error) {
        console.error("Unban command error:", error);
        await ctx.reply(
          "❌ Error processing unban command. Usage: /unban <username_or_id>",
        );
      }
    });

    bot.command("welcome", async (ctx) => {
      try {
        const { metaBotInfo } = ctx;
        const isOwner = await this.checkOwnerAccess(
          metaBotInfo.mainBotId,
          ctx.from.id,
        );

        if (!isOwner) {
          await ctx.reply("❌ Only bot owner can change welcome message.");
          return;
        }

        await this.startChangeWelcomeMessage(ctx, metaBotInfo.mainBotId);
      } catch (error) {
        console.error("Welcome command error:", error);
        await ctx.reply("❌ Error changing welcome message.");
      }
    });

    bot.command("transfer", async (ctx) => {
      try {
        const { metaBotInfo } = ctx;
        const isOwner = await this.checkOwnerAccess(
          metaBotInfo.mainBotId,
          ctx.from.id,
        );

        if (!isOwner) {
          await ctx.reply("❌ Only bot owner can transfer ownership.");
          return;
        }

        await this.handleTransferOwnership(ctx, metaBotInfo.mainBotId);
      } catch (error) {
        console.error("Transfer command error:", error);
        await ctx.reply("❌ Error transferring ownership.");
      }
    });

    bot.command("reset", async (ctx) => {
      try {
        const { metaBotInfo } = ctx;
        const isOwner = await this.checkOwnerAccess(
          metaBotInfo.mainBotId,
          ctx.from.id,
        );

        if (!isOwner) {
          await ctx.reply("❌ Only bot owner can reset welcome message.");
          return;
        }

        await this.resetWelcomeMessage(ctx, metaBotInfo.mainBotId);
      } catch (error) {
        console.error("Reset command error:", error);
        await ctx.reply("❌ Error resetting welcome message.");
      }
    });

    bot.command("channels", async (ctx) => {
      try {
        const { metaBotInfo } = ctx;
        const isOwner = await this.checkOwnerAccess(
          metaBotInfo.mainBotId,
          ctx.from.id,
        );

        if (!isOwner) {
          await ctx.reply("❌ Only bot owner can manage channels.");
          return;
        }

        await ChannelJoinHandler.showChannelManagement(
          ctx,
          metaBotInfo.mainBotId,
        );
      } catch (error) {
        console.error("Channels command error:", error);
        await ctx.reply("❌ Error managing channels.");
      }
    });

    bot.command("donate", async (ctx) => {
      try {
        const { metaBotInfo } = ctx;
        await this.handleDonation(ctx, metaBotInfo.mainBotId);
      } catch (error) {
        console.error("Donate command error:", error);
        await ctx.reply("❌ Error loading donation options.");
      }
    });

    bot.command("catalog", async (ctx) => {
      try {
        const { metaBotInfo } = ctx;
        await this.handleProductCatalog(ctx, metaBotInfo.mainBotId);
      } catch (error) {
        console.error("Catalog command error:", error);
        await ctx.reply("❌ Error loading product catalog.");
      }
    });

    bot.command("myorders", async (ctx) => {
      try {
        const userId = ctx.from.id;
        await this.showUserPurchases(ctx, userId);
      } catch (error) {
        console.error("Myorders command error:", error);
        await ctx.reply("❌ Error loading your orders.");
      }
    });

    // ========== OPTIMIZED CALLBACK QUERY HANDLER ==========
    bot.on("callback_query", async (ctx) => {
      try {
        const data = ctx.callbackQuery.data;
        const userId = ctx.from.id;
        const { metaBotInfo } = ctx;

        // ALWAYS answer callback query first
        await ctx.answerCbQuery();

        // Handle all actions by editing the current message
        // This ensures a seamless experience without duplicate messages

        // Settings action - show settings
        if (data === "mini_settings") {
          await this.showSettings(ctx, metaBotInfo.mainBotId);
          return;
        }

        // Dashboard action - show dashboard
        if (data === "mini_dashboard") {
          await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
          return;
        }

        // Stats action
        if (data === "mini_stats") {
          await this.showStats(ctx, metaBotInfo.mainBotId);
          return;
        }

        // Broadcast action
        if (data === "mini_broadcast") {
          await this.startBroadcast(ctx, metaBotInfo.mainBotId);
          return;
        }

        // Admins action
        if (data === "mini_admins") {
          const isOwner = await this.checkOwnerAccess(
            metaBotInfo.mainBotId,
            userId,
          );
          if (isOwner) {
            await this.showAdmins(ctx, metaBotInfo.mainBotId);
          } else {
            await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
            await ctx.reply("❌ Only bot owner can manage admins.");
          }
          return;
        }

        // Ban management
        if (data.startsWith("ban_management_")) {
          const botId = data.replace("ban_management_", "");
          await BanHandler.showBanManagement(ctx, botId);
          return;
        }

        // Transfer ownership
        if (data.startsWith("transfer_ownership_")) {
          const botId = data.replace("transfer_ownership_", "");
          await this.handleTransferOwnership(ctx, botId);
          return;
        }

        // Catalog
        if (data.startsWith("catalog_")) {
          const botId = data.replace("catalog_", "");
          await this.handleProductCatalog(ctx, botId);
          return;
        }

        // Settings actions (welcome, channels, referral, etc.)
        if (data.startsWith("settings_")) {
          const action = data.replace("settings_", "");
          ctx.match = { 1: action };
          await this.handleSettingsAction(ctx);
          return;
        }

        // Donation toggle
        if (data === "settings_toggle_donations") {
          await this.toggleDonationSystem(ctx, metaBotInfo.mainBotId);
          return;
        }

        // Premium locked donation
        if (data === "settings_donation_premium_locked") {
          await this.handlePremiumLockedFeature(ctx);
          return;
        }

        // Broadcast confirmation
        if (data.startsWith("confirm_broadcast_")) {
          const botId = data.replace("confirm_broadcast_", "");
          await this.handleBroadcastConfirmation(ctx, botId);
          return;
        }

        // Broadcast cancellation - go back to dashboard
        if (data.startsWith("cancel_broadcast_")) {
          const botId = data.replace("cancel_broadcast_", "");
          this.broadcastSessions.delete(userId);
          await ctx.reply("❌ Broadcast cancelled.");
          await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
          return;
        }

        // Transfer cancellation

        if (data.startsWith("cancel_transfer_")) {
          const botId = data.replace("cancel_transfer_", "");
          this.transferOwnershipSessions.delete(userId);
          await ctx.answerCbQuery("✅ Transfer cancelled");

          const cancelMsg = await ctx.reply("❌ Transfer cancelled.");
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(cancelMsg.message_id);
            } catch (e) {}
          }, 2000);

          setTimeout(async () => {
            await this.showSettings(ctx, botId);
          }, 300);
          return;
        }

        // Settings dashboard (back to settings main)
        if (data === "settings_dashboard") {
          await this.showSettings(ctx, metaBotInfo.mainBotId);
          return;
        }

        // Stats with back to settings
        if (data === "mini_stats") {
          await this.showStats(ctx, metaBotInfo.mainBotId);
          return;
        }

        // Welcome cancellation - go back to settings
        if (data.startsWith("cancel_welcome_")) {
          const botId = data.replace("cancel_welcome_", "");
          this.welcomeMessageSessions.delete(userId);
          await ctx.reply("❌ Welcome change cancelled.");
          await this.showSettings(ctx, botId);
          return;
        }

        // Admin actions
        if (data.startsWith("admin_")) {
          await this.handleAdminAction(ctx);
          return;
        }

        if (data.startsWith("remove_admin_")) {
          await this.handleRemoveAdminAction(ctx);
          return;
        }

        // Mini actions
        if (data.startsWith("mini_")) {
          await this.handleMiniAction(ctx);
          return;
        }

        // Donation actions
        if (data.startsWith("donate_")) {
          const parts = data.split("_");
          if (parts.length === 3) {
            const botId = parts[1];
            const amount = parseFloat(parts[2]);
            if (!isNaN(amount)) {
              await this.processDonation(ctx, botId, amount);
            }
          }
          return;
        }

        if (data.startsWith("donate_custom_")) {
          const botId = data.replace("donate_custom_", "");
          this.donationSessions.delete(userId);
          this.donationSessions.set(userId, {
            botId: botId,
            step: "awaiting_custom_amount",
            createdAt: Date.now(),
          });

          await ctx.editMessageText(
            "💵 *Custom Donation Amount*\n\n" +
              "Please enter the donation amount in BOM:\n\n" +
              "*Examples:* 2.5, 15, 100\n\n" +
              "💎 *Note:* 1 BOM = $1.00 USD\n\n" +
              "*To cancel:* Type /cancel or click the button below",
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [Markup.button.callback("❌ Cancel", `donate_cancel_${botId}`)],
              ]),
            },
          );
          return;
        }

        if (data.startsWith("donate_cancel_")) {
          const botId = data.replace("donate_cancel_", "");
          this.donationSessions.delete(userId);
          await ctx.answerCbQuery("✅ Donation cancelled");

          const cancelMsg = await ctx.reply("❌ Donation cancelled.");
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(cancelMsg.message_id);
            } catch (e) {}
          }, 2000);

          setTimeout(async () => {
            await this.handleDonation(ctx, botId);
          }, 300);
          return;
        }

        // Product catalog actions
        if (data.startsWith("product_view_")) {
          const productId = data.replace("product_view_", "");
          await this.handleProductView(ctx, productId);
          return;
        }

        if (data.startsWith("product_buy_")) {
          const parts = data.split("_");
          if (parts.length === 3) {
            const productId = parts[1];
            const quantity = parseInt(parts[2]);
            await this.handleProductPurchase(ctx, productId, quantity);
          }
          return;
        }

        if (data.startsWith("product_custom_")) {
          const productId = data.replace("product_custom_", "");
          this.productCatalogSessions.set(userId, {
            productId: productId,
            step: "awaiting_custom_quantity",
            action: "custom_purchase",
            createdAt: Date.now(),
          });

          await ctx.editMessageText(
            "🔢 *Enter Quantity*\n\n" +
              "Please enter the quantity you want to purchase:\n\n" +
              "*Examples:* 5, 10, 20\n\n" +
              "*Note:* Make sure you have enough BOM balance\n" +
              "*Cancel:* Type /cancel",
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    "❌ Cancel",
                    `product_view_${productId}`,
                  ),
                ],
              ]),
            },
          );
          return;
        }

        if (data.startsWith("product_manage_")) {
          const botId = data.replace("product_manage_", "");
          await this.handleProductManagement(ctx, botId);
          return;
        }

        // Reply actions
        if (data.startsWith("reply_")) {
          const feedbackId = data.replace("reply_", "");
          const isAdmin = await this.checkAdminAccess(
            metaBotInfo.mainBotId,
            userId,
          );
          if (isAdmin) {
            await this.startReply(ctx, feedbackId);
          } else {
            await ctx.reply("❌ Admin access required.");
          }
          return;
        }

        // Main menu - go to main bot
        if (data === "start") {
          await ctx.editMessageText("🔙 Returning to main menu...", {
            parse_mode: "Markdown",
          });
          // Send to main bot handler via the bot instance
          // The main bot will handle this
          return;
        }

        // No-op for premium active button
        if (data === "noop") {
          return;
        }

        console.log(`⚠️ Unhandled callback query: ${data}`);
        await ctx.reply("⚠️ Action not available");
      } catch (error) {
        console.error("Callback query handler error:", error);
        await ctx.answerCbQuery("❌ Error processing action");
      }
    });

    // ========== MESSAGE HANDLERS ==========
    bot.on("text", (ctx) => this.handleTextMessage(ctx));
    bot.on("photo", (ctx) => this.handleImageMessage(ctx));
    bot.on("video", (ctx) => this.handleVideoMessage(ctx));
    bot.on("document", (ctx) => this.handleDocumentMessage(ctx));
    bot.on("audio", (ctx) => this.handleAudioMessage(ctx));
    bot.on("voice", (ctx) => this.handleVoiceMessage(ctx));
    bot.on("media_group", (ctx) => this.handleMediaGroupMessage(ctx));

    bot.catch((error, ctx) => {
      console.error(`Error in mini-bot ${ctx.metaBotInfo?.botName}:`, error);
    });

    console.log("✅ Bot handlers setup complete");
  };

  // ========== SET BOT COMMANDS ==========
  setBotCommands = async (bot, token, userId = null) => {
    try {
      const botToken = token || bot?.token || bot?.telegram?.token;
      if (!botToken) {
        console.error("❌ No bot token available");
        return;
      }

      const userCommands = [
        { command: "start", description: "🚀 Start the bot" },
        { command: "referral", description: "💰 Referral program" },
        { command: "donate", description: "☕ Support bot owner" },
        { command: "catalog", description: "🛍️ View product catalog" },
        { command: "help", description: "❓ Get help" },
      ];

      const adminCommands = [
        { command: "start", description: "🚀 Start the bot" },
        { command: "dashboard", description: "📊 Admin dashboard" },
        { command: "broadcast", description: "📢 Send broadcast" },
        { command: "stats", description: "📈 View statistics" },
        { command: "admins", description: "👥 Manage admins" },
        { command: "settings", description: "⚙️ Bot settings" },
        { command: "help", description: "❓ Get help" },
        { command: "ban", description: "🚫 Ban user" },
        { command: "unban", description: "✅ Unban user" },
        { command: "referral", description: "💰 Referral program" },
        { command: "catalog", description: "🛍️ Manage product catalog" },
        { command: "welcome", description: "✏️ Change welcome message" },
        { command: "transfer", description: "🔄 Transfer bot ownership" },
        { command: "reset", description: "🔄 Reset welcome message" },
        { command: "channels", description: "📢 Force join channels" },
        { command: "donate", description: "☕ Support bot owner" },
      ];

      let commands = userCommands;
      let scope = {};

      if (userId) {
        const botId =
          bot?.context?.metaBotInfo?.mainBotId ||
          bot?.context?.metaBotInfo?.botRecord?.id;
        const isAdmin = await this.checkAdminAccess(botId, userId);
        commands = isAdmin ? adminCommands : userCommands;
        scope = { type: "chat", chat_id: userId };
      }

      const url = `https://api.telegram.org/bot${botToken}/setMyCommands`;
      const payload =
        Object.keys(scope).length > 0 ? { commands, scope } : { commands };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.ok) {
        console.log(
          `✅ Commands set for ${userId ? "user " + userId : "all users"}`,
        );
      } else {
        console.log(`⚠️ Command set response: ${data.description}`);
      }
    } catch (error) {
      console.error("❌ Failed to set bot commands:", error.message);
    }
  };

  // ========== NATIVE TELEGRAM EDIT HANDLER ==========
  handleNativeMessageEdit = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const editedMessage = ctx.editedMessage || ctx.update.edited_message;

      if (!editedMessage || !metaBotInfo) {
        return;
      }

      const user = editedMessage.from;
      const messageId = editedMessage.message_id;
      const newContent =
        editedMessage.text || editedMessage.caption || "[Edited content]";

      console.log(
        `✏️ Native edit detected from user ${user.id} for message ${messageId}`,
      );

      const feedback = await Feedback.findOne({
        where: {
          bot_id: metaBotInfo.mainBotId,
          user_id: user.id,
          message_id: messageId,
        },
      });

      if (feedback) {
        await feedback.update({
          message: newContent,
          is_edited: true,
          edited_at: new Date(),
        });
        console.log(`✅ Database updated for native edit from user ${user.id}`);
      } else {
        console.log(
          `❌ Original message not found in database for native edit`,
        );
      }
    } catch (error) {
      console.error("Error handling native message edit:", error);
    }
  };

  // ========== DELETE AFTER DELAY ==========
  deleteAfterDelay = async (ctx, messageId, delay = 2000) => {
    try {
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(messageId);
          console.log(`✅ Message ${messageId} deleted after ${delay}ms`);
        } catch (error) {
          console.log(
            `⚠️ Could not delete message ${messageId}:`,
            error.message,
          );
        }
      }, delay);
    } catch (error) {
      console.error("Error setting up message deletion:", error);
    }
  };

  // ========== HANDLE START ==========
  handleStart = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const user = ctx.from;

      console.log(
        `🚀 Start command received for ${metaBotInfo.botName} from ${user.first_name} (ID: ${user.id})`,
      );

      await this.setBotCommands(ctx.telegram, null, user.id);

      await UserLog.upsert({
        bot_id: metaBotInfo.mainBotId,
        user_id: user.id,
        user_username: user.username,
        user_first_name: user.first_name,
        last_interaction: new Date(),
        first_interaction: new Date(),
        interaction_count: 1,
      });

      await this.updateBotUserCount(metaBotInfo.mainBotId);

      const isAdmin = await this.checkAdminAccess(
        metaBotInfo.mainBotId,
        user.id,
      );

      if (isAdmin) {
        await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
      } else {
        await this.showUserWelcome(ctx, metaBotInfo);
      }
    } catch (error) {
      console.error("Start handler error:", error);
      await ctx.reply("Welcome! Send me a message, image, or video.");
    }
  };

  // ========== UPDATE BOT USER COUNT ==========
  updateBotUserCount = async (botId) => {
    try {
      const userCount = await UserLog.count({
        where: { bot_id: botId },
      });

      await Bot.update({ user_count: userCount }, { where: { id: botId } });

      return userCount;
    } catch (error) {
      console.error("Update user count error:", error);
      return 0;
    }
  };

  // ========== GET WELCOME MESSAGE ==========
  getWelcomeMessage = async (botId) => {
    try {
      const bot = await Bot.findByPk(botId);
      let welcomeMessage = bot?.welcome_message;

      const botRef = this.getBotReference();

      if (!welcomeMessage) {
        return (
          `👋 Welcome to *{botName}*!\n\n` +
          `We are here to assist you with any questions or concerns you may have.\n\n` +
          `Simply send us a message, and we'll respond as quickly as possible!\n\n` +
          `_This Bot is created by @${botRef.username}_`
        );
      }

      const creatorCredit = `_This Bot is created by @${botRef.username}_`;
      if (
        !welcomeMessage.includes(botRef.username) &&
        !welcomeMessage.includes("BotomicsBot")
      ) {
        welcomeMessage += `\n\n${creatorCredit}`;
      }

      return welcomeMessage;
    } catch (error) {
      console.error("Error getting welcome message:", error);
      const botRef = this.getBotReference();
      return (
        `👋 Welcome to *{botName}*!\n\n` +
        `We are here to assist you with any questions or concerns you may have.\n\n` +
        `Simply send us a message, and we'll respond as quickly as possible!\n\n` +
        `_This Bot is created by @${botRef.username}_`
      );
    }
  };

  // ========== SHOW USER WELCOME ==========
  showUserWelcome = async (ctx, metaBotInfo) => {
    try {
      let welcomeMessage = await this.getWelcomeMessage(metaBotInfo.mainBotId);
      welcomeMessage = welcomeMessage.replace(
        /{botName}/g,
        metaBotInfo.botName,
      );

      const bot = await Bot.findByPk(metaBotInfo.mainBotId);

      if (bot && bot.has_donation_enabled) {
        await ctx.replyWithMarkdown(welcomeMessage);
      } else {
        await ctx.replyWithMarkdown(welcomeMessage);
      }
    } catch (error) {
      console.error("User welcome error:", error);
      const botRef = this.getBotReference(metaBotInfo.botName);
      await ctx.replyWithMarkdown(
        `👋 Welcome to *${metaBotInfo.botName}*!\n\nWe are here to assist you with any questions or concerns you may have.\n\nSimply send us a message, and we'll respond as quickly as possible!\n\n_This Bot is created by @${botRef.username}_`,
      );
    }
  };

  // ========== REDESIGNED ADMIN DASHBOARD ==========
  showSimplifiedAdminDashboard = async (ctx, metaBotInfo) => {
    try {
      const stats = await this.getQuickStats(metaBotInfo.mainBotId);
      const botRef = this.getBotReference(metaBotInfo.botName);

      const bot = await Bot.findByPk(metaBotInfo.mainBotId);
      const subscriptionTier = await SubscriptionService.getSubscriptionTier(
        bot.owner_id,
      );
      const isPremium = subscriptionTier === "premium";

      // Clean dashboard with only essential info
      const dashboardMessage =
        `🌟 *${metaBotInfo.botName} Dashboard*\n\n` +
        `📊 *Quick Stats*\n` +
        `┌─────────────────────┐\n` +
        `│ 👥 Users: ${stats.totalUsers.toString().padStart(8)} │\n` +
        `│ 💬 Messages: ${stats.totalMessages.toString().padStart(5)} │\n` +
        `│ 📨 Pending: ${stats.pendingMessages.toString().padStart(6)} │\n` +
        `│ 🎫 ${isPremium ? "⭐ Premium" : "🆓 Freemium"} │\n` +
        `└─────────────────────┘\n\n` +
        `*Quick Actions*\n` +
        `• Click a button below to get started\n` +
        `• All management is done right here!`;

      // ONLY 2 BUTTONS on the front dashboard: Settings and Upgrade to Premium
      const keyboardButtons = [];

      // Settings button - always visible
      keyboardButtons.push([
        Markup.button.callback("⚙️ Settings", "mini_settings"),
      ]);

      // Upgrade to Premium button - only show for freemium users
      if (!isPremium) {
        keyboardButtons.push([
          Markup.button.webApp("💎 Upgrade to Premium", `${PUBLIC_URL}/wallet`),
        ]);
      } else {
        // Show premium status for premium users
        keyboardButtons.push([
          Markup.button.callback("⭐ Premium Active", "noop"),
        ]);
      }

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      const userId = ctx.from.id;
      this.setCachedResponse(userId, "mini_dashboard", {
        message: dashboardMessage,
        keyboard: keyboard,
      });

      if (ctx.updateType === "callback_query") {
        await ctx.editMessageText(dashboardMessage, {
          parse_mode: "Markdown",
          ...keyboard,
        });
        await ctx.answerCbQuery();
      } else {
        await ctx.replyWithMarkdown(dashboardMessage, keyboard);
      }
    } catch (error) {
      console.error("Simplified admin dashboard error:", error);
      await ctx.reply("❌ Error loading dashboard.");
    }
  };

  // ========== REDESIGNED SETTINGS ==========
  showSettings = async (ctx, botId) => {
    try {
      const bot = await Bot.findByPk(botId);
      const botRef = this.getBotReference(bot.bot_name);

      const ChannelJoin = require("../models/ChannelJoin");
      const ReferralProgram = require("../models/ReferralProgram");
      const UserBan = require("../models/UserBan");

      const [
        channelCount,
        referralProgram,
        banCount,
        productCount,
        subscriptionTier,
      ] = await Promise.all([
        ChannelJoin.count({ where: { bot_id: botId, is_active: true } }),
        ReferralProgram.findOne({ where: { bot_id: botId } }),
        UserBan.count({ where: { bot_id: botId, is_active: true } }),
        ProductCatalog.count({ where: { bot_id: botId, is_active: true } }),
        SubscriptionService.getSubscriptionTier(bot.owner_id),
      ]);

      const isPremium = subscriptionTier === "premium";

      // Escape special characters for Markdown
      const escapeMarkdown = (text) => {
        if (!text) return "";
        return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
      };

      const botName = escapeMarkdown(bot.bot_name || "Bot");
      const channelStatus = channelCount > 0 ? "🟢 Active" : "🔴 Inactive";
      const referralStatus = referralProgram?.is_enabled
        ? "🟢 Active"
        : "🔴 Inactive";
      const banStatus = banCount > 0 ? "🟢 Active" : "🔴 Inactive";
      const catalogStatus = productCount > 0 ? "🟢 Active" : "🔴 Inactive";
      const donationStatus = bot.has_donation_enabled
        ? "🟢 Active"
        : "🔴 Inactive";

      const settingsMessage =
        `⚙️ *${botName} Settings*\n\n` +
        `🎫 *Plan:* ${isPremium ? "⭐ Premium" : "🆓 Freemium"}\n\n` +
        `📌 *Features Status*\n` +
        `┌─────────────────────┐\n` +
        `│ 📢 Channels: ${channelStatus} │\n` +
        `│ 💰 Referral: ${referralStatus} │\n` +
        `│ 🚫 Ban System: ${banStatus} │\n` +
        `│ 🛍️ Catalog: ${catalogStatus} │\n` +
        `│ ☕ Donation: ${donationStatus} │\n` +
        `└─────────────────────┘\n\n` +
        `${isPremium ? "⭐ All features unlocked!" : "💎 Upgrade to Premium for Donation System"}\n\n` +
        `*Here Are All Features:*`;

      // ALL FEATURES inside Settings
      const keyboardButtons = [];

      // Row 1: Broadcast & Stats
      keyboardButtons.push([
        Markup.button.callback("📢 Broadcast", "mini_broadcast"),
        Markup.button.callback("📊 Statistics", "mini_stats"),
      ]);

      // Row 2: Admins & Ban Management
      keyboardButtons.push([
        Markup.button.callback("👥 Admins", "mini_admins"),
        Markup.button.callback("🚫 Ban Management", `ban_management_${botId}`),
      ]);

      // Row 3: Welcome & Channels
      keyboardButtons.push([
        Markup.button.callback("✏️ Welcome", "settings_welcome"),
        Markup.button.callback("📢 Channels", "settings_channels"),
      ]);

      // Row 4: Referral & Transfer
      keyboardButtons.push([
        Markup.button.callback("💰 Referral", "settings_referral"),
        Markup.button.callback("🔄 Transfer", `transfer_ownership_${botId}`),
      ]);

      // Row 5: Donation & Catalog
      if (isPremium) {
        keyboardButtons.push([
          Markup.button.callback(
            bot.has_donation_enabled
              ? "❌ Disable Donation"
              : "☕ Enable Donation",
            "settings_toggle_donations",
          ),
          Markup.button.callback("🛍️ Catalog", `catalog_${botId}`),
        ]);
      } else {
        keyboardButtons.push([
          Markup.button.callback(
            "☕ Donation",
            "settings_donation_premium_locked",
          ),
          Markup.button.callback("🛍️ Catalog", `catalog_${botId}`),
        ]);
        // Premium upgrade button inside settings
        keyboardButtons.push([
          Markup.button.webApp("💎 Upgrade to Premium", `${PUBLIC_URL}/wallet`),
        ]);
      }

      // Row 6: Back to Dashboard
      keyboardButtons.push([
        Markup.button.callback("🔙 Dashboard", "mini_dashboard"),
      ]);

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      const userId = ctx.from.id;
      this.setCachedResponse(userId, `settings_${botId}`, {
        message: settingsMessage,
        keyboard: keyboard,
      });

      if (ctx.updateType === "callback_query") {
        await ctx.editMessageText(settingsMessage, {
          parse_mode: "Markdown",
          ...keyboard,
        });
        await ctx.answerCbQuery();
      } else {
        await ctx.replyWithMarkdown(settingsMessage, keyboard);
      }
    } catch (error) {
      console.error("Show settings error:", error);
      // Fallback without Markdown
      try {
        const fallbackMessage = `⚙️ Bot Settings\n\nPlan: ${isPremium ? "Premium" : "Freemium"}\n\nUse the buttons below:`;
        if (ctx.updateType === "callback_query") {
          await ctx.editMessageText(fallbackMessage, {
            ...Markup.inlineKeyboard([
              [Markup.button.callback("🔙 Dashboard", "mini_dashboard")],
            ]),
          });
        } else {
          await ctx.reply(fallbackMessage, {
            ...Markup.inlineKeyboard([
              [Markup.button.callback("🔙 Dashboard", "mini_dashboard")],
            ]),
          });
        }
      } catch (fallbackError) {
        console.error("Fallback error:", fallbackError);
        await ctx.reply("❌ Error loading settings. Please try again.");
      }
    }
  };
  // ========== PREMIUM LOCKED FEATURE HANDLER ==========
  handlePremiumLockedFeature = async (ctx) => {
    const botId =
      ctx.metaBotInfo?.mainBotId || ctx.callbackQuery?.data?.split("_").pop();

    await ctx.editMessageText(
      `☕ *Donation System - Premium Feature*\n\n` +
        `The donation system is available for premium users only.\n\n` +
        `💎 *Upgrade to Premium for:*\n` +
        `• Enable donation system\n` +
        `• Receive BOM donations\n` +
        `• All premium features\n\n` +
        `*Price:* 3 BOM per month ($3.00)\n\n` +
        `👇 Click below to upgrade now!`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.webApp(
              "💎 Upgrade to Premium",
              `${PUBLIC_URL}/wallet`,
            ),
          ],
          [Markup.button.callback("🔙 Back to Settings", `settings_dashboard`)],
        ]),
      },
    );
  };

  // ========== TOGGLE DONATION SYSTEM ==========
  toggleDonationSystem = async (ctx, botId) => {
    try {
      const isOwner = await this.checkOwnerAccess(botId, ctx.from.id);
      if (!isOwner) {
        await ctx.reply("❌ Only bot owner can manage donation system.");
        return;
      }

      const bot = await Bot.findByPk(botId);
      const canEnableDonation = await SubscriptionService.checkFeatureAccess(
        ctx.from.id,
        "donation_system",
      );

      const newStatus = !bot.has_donation_enabled;

      if (newStatus && !canEnableDonation) {
        await ctx.reply(
          `❌ *Premium Feature Required*\n\n` +
            `Donation system is available for premium users only.\n\n` +
            `💎 *Upgrade to unlock:*\n` +
            `• Enable donation system\n` +
            `• Receive BOM donations\n` +
            `• All premium features\n\n` +
            `*Price:* 3 BOM per month ($3.00)`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.webApp(
                  "💎 Upgrade to Premium",
                  `${PUBLIC_URL}/wallet`,
                ),
              ],
              [Markup.button.callback("🔙 Back", `settings_${botId}`)],
            ]),
          },
        );
        return;
      }

      await bot.update({ has_donation_enabled: newStatus });

      const statusText = newStatus ? "enabled 🎉" : "disabled";
      const emoji = newStatus ? "✅" : "❌";

      const replyMsg = await ctx.reply(
        `${emoji} Donation system ${statusText} for ${bot.bot_name}\n\n` +
          (newStatus
            ? `Users can now support your bot via donations! Use /donate in your bot.`
            : `Donation system is now disabled.`),
      );

      await this.deleteAfterDelay(ctx, replyMsg.message_id, 5000);
      await this.showSettings(ctx, botId);
    } catch (error) {
      console.error("Toggle donation system error:", error);
      await ctx.reply("❌ Error toggling donation system.");
    }
  };

  // ========== START CHANGE WELCOME MESSAGE ==========
  startChangeWelcomeMessage = async (ctx, botId) => {
    try {
      this.welcomeMessageSessions.set(ctx.from.id, {
        botId: botId,
        step: "awaiting_welcome_message",
        createdAt: Date.now(),
      });

      const bot = await Bot.findByPk(botId);
      const botRef = this.getBotReference();
      const currentMessage =
        bot.welcome_message ||
        `👋 Welcome to *${bot.bot_name}*!\n\nWe are here to assist you with any questions or concerns you may have.\n\nSimply send us a message, and we'll respond as quickly as possible!\n\n_This Bot is created by @${botRef.username}_`;

      await ctx.editMessageText(
        `✏️ *Change Welcome Message*\n\n` +
          `*Current Message:*\n${currentMessage}\n\n` +
          `Please send the new welcome message:\n\n` +
          `*Tips:*\n` +
          `• Use {botName} as placeholder for bot name\n` +
          `• Markdown formatting is supported\n\n` +
          `*To cancel:* Type /cancel or click the button below`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("❌ Cancel", `cancel_welcome_${botId}`)],
          ]),
        },
      );
    } catch (error) {
      console.error("Start change welcome message error:", error);
      await ctx.reply("❌ Error starting welcome message change.");
    }
  };

  // ========== RESET WELCOME MESSAGE ==========
  resetWelcomeMessage = async (ctx, botId) => {
    try {
      const bot = await Bot.findByPk(botId);
      await bot.update({ welcome_message: null });

      const successMsg = await ctx.reply(
        "✅ Welcome message reset to default.",
      );
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);

      await this.showSettings(ctx, botId);
    } catch (error) {
      console.error("Reset welcome message error:", error);
      await ctx.reply("❌ Error resetting welcome message.");
    }
  };

  // ========== PROCESS WELCOME MESSAGE CHANGE ==========
  processWelcomeMessageChange = async (ctx, botId, newMessage) => {
    try {
      const bot = await Bot.findByPk(botId);
      await bot.update({ welcome_message: newMessage });

      const successMsg = await ctx.reply(
        "✅ Welcome message updated successfully!",
      );
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);

      await this.showSettings(ctx, botId);
    } catch (error) {
      console.error("Process welcome message change error:", error);
      await ctx.reply("❌ Error updating welcome message.");
    }
  };

  // ========== CHECK ACCESS ==========
  checkAdminAccess = async (botId, userId) => {
    try {
      const bot = await Bot.findByPk(botId);
      if (bot.owner_id == userId) return true;

      const admin = await Admin.findOne({
        where: { bot_id: botId, admin_user_id: userId },
      });

      return !!admin;
    } catch (error) {
      return false;
    }
  };

  checkOwnerAccess = async (botId, userId) => {
    try {
      const bot = await Bot.findByPk(botId);
      return bot.owner_id == userId;
    } catch (error) {
      return false;
    }
  };

  // ========== GET QUICK STATS ==========
  getQuickStats = async (botId) => {
    try {
      const userCount = await UserLog.count({ where: { bot_id: botId } });
      const messageCount = await Feedback.count({ where: { bot_id: botId } });
      const pendingCount = await Feedback.count({
        where: { bot_id: botId, is_replied: false },
      });

      return {
        totalUsers: userCount,
        totalMessages: messageCount,
        pendingMessages: pendingCount,
      };
    } catch (error) {
      return { totalUsers: 0, totalMessages: 0, pendingMessages: 0 };
    }
  };

  // ========== HANDLE DASHBOARD ==========
  handleDashboard = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const isAdmin = await this.checkAdminAccess(
        metaBotInfo.mainBotId,
        ctx.from.id,
      );

      if (isAdmin) {
        await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
      } else {
        await ctx.reply(
          "❌ Admin access required. Use /start for user features.",
        );
      }
    } catch (error) {
      console.error("Dashboard error:", error);
      await ctx.reply("❌ Error loading dashboard.");
    }
  };

  // ========== HANDLE HELP ==========
  handleHelp = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const isAdmin = await this.checkAdminAccess(
        metaBotInfo.mainBotId,
        ctx.from.id,
      );

      const botRef = this.getBotReference();

      let helpMessage;

      if (isAdmin) {
        helpMessage =
          `🤖 *Admin Help*\n\n` +
          `*Commands*\n` +
          `/dashboard - 📊 Admin dashboard\n` +
          `/broadcast - 📢 Send broadcast\n` +
          `/stats - 📈 View statistics\n` +
          `/admins - 👥 Manage admins (owner only)\n` +
          `/settings - ⚙️ Bot settings (owner only)\n` +
          `/ban - 🚫 Ban user\n` +
          `/unban - ✅ Unban user\n` +
          `/referral - 💰 Referral program\n` +
          `/catalog - 🛍️ Product catalog\n` +
          `/welcome - ✏️ Welcome message (owner only)\n` +
          `/transfer - 🔄 Transfer ownership (owner only)\n` +
          `/channels - 📢 Force join channels (owner only)\n` +
          `/donate - ☕ Support bot owner\n\n` +
          `*Tips*\n` +
          `• Use the Menu (/) for quick access\n` +
          `• Reply to users from notifications\n` +
          `• Send images/videos as admin\n\n` +
          `*Support:* @${botRef.supportBot}`;
      } else {
        helpMessage =
          `🤖 *Help*\n\n` +
          `*How to use*\n` +
          `• Send any message to contact us\n` +
          `• Share images, videos, or files\n` +
          `• We'll respond as soon as possible\n\n` +
          `*Commands*\n` +
          `/start - 🚀 Start\n` +
          `/help - ❓ Help\n` +
          `/referral - 💰 Referral program\n` +
          `/donate - ☕ Support bot owner\n` +
          `/catalog - 🛍️ View products\n\n` +
          `*We're here to help!* 🤝`;
      }

      await ctx.replyWithMarkdown(helpMessage);
    } catch (error) {
      console.error("Help command error:", error);
      await ctx.reply("Use /start to begin.");
    }
  };

  // ========== HANDLE SETTINGS ACTION ==========
  handleSettingsAction = async (ctx) => {
    try {
      // Get the action from callback data
      let action;
      if (ctx.match && ctx.match[1]) {
        action = ctx.match[1];
      } else if (ctx.callbackQuery && ctx.callbackQuery.data) {
        const data = ctx.callbackQuery.data;
        if (data.startsWith("settings_")) {
          action = data.replace("settings_", "");
        }
      }

      if (!action) {
        console.error("No action found in handleSettingsAction");
        await ctx.answerCbQuery("❌ Invalid action");
        return;
      }

      const { metaBotInfo } = ctx;
      const user = ctx.from;

      // Handle premium locked donation - show upgrade button
      if (action === "donation_premium_locked") {
        await this.handlePremiumLockedFeature(ctx);
        return;
      }

      if (action === "dashboard") {
        await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
        return;
      }

      // Check if user is owner
      const isOwner = await this.checkOwnerAccess(
        metaBotInfo.mainBotId,
        user.id,
      );
      if (!isOwner) {
        await ctx.editMessageText("❌ Only bot owner can change settings.", {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🔙 Back to Settings",
                `settings_dashboard`,
              ),
            ],
          ]),
        });
        return;
      }

      switch (action) {
        case "welcome":
          await this.startChangeWelcomeMessage(ctx, metaBotInfo.mainBotId);
          break;
        case "reset_welcome":
          await this.resetWelcomeMessage(ctx, metaBotInfo.mainBotId);
          break;
        case "channels":
          await ChannelJoinHandler.showChannelManagement(
            ctx,
            metaBotInfo.mainBotId,
          );
          break;
        case "referral":
          await ReferralHandler.showReferralManagement(
            ctx,
            metaBotInfo.mainBotId,
          );
          break;
        case "catalog":
          await this.handleProductCatalog(ctx, metaBotInfo.mainBotId);
          break;
        case "toggle_donations":
          await this.toggleDonationSystem(ctx, metaBotInfo.mainBotId);
          break;
        case "dashboard":
          await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
          break;
        default:
          console.log(`⚠️ Unhandled settings action: ${action}`);
          await ctx.editMessageText("⚠️ Action not available", {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "🔙 Back to Settings",
                  `settings_dashboard`,
                ),
              ],
            ]),
          });
      }
    } catch (error) {
      console.error("Settings action error:", error);
      await ctx.editMessageText("❌ Error processing settings action", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Back to Settings", `settings_dashboard`)],
        ]),
      });
    }
  };
  // ========== SHOW STATS ==========
  showStats = async (ctx, botId) => {
    try {
      const userCount = await UserLog.count({ where: { bot_id: botId } });
      const messageCount = await Feedback.count({ where: { bot_id: botId } });
      const pendingCount = await Feedback.count({
        where: { bot_id: botId, is_replied: false },
      });

      const messageTypes = await Feedback.findAll({
        where: { bot_id: botId },
        attributes: [
          "message_type",
          [
            Feedback.sequelize.fn("COUNT", Feedback.sequelize.col("id")),
            "count",
          ],
        ],
        group: ["message_type"],
      });

      let typeBreakdown = "";
      messageTypes.forEach((type) => {
        typeBreakdown += `• ${this.getMediaTypeEmoji(type.message_type)} ${type.message_type}: ${type.dataValues.count}\n`;
      });

      const statsMessage =
        `📊 *Statistics*\n\n` +
        `👥 Total Users: ${userCount}\n` +
        `💬 Total Messages: ${messageCount}\n` +
        `📨 Pending Replies: ${pendingCount}\n` +
        `🔄 Status: ✅ Active\n\n` +
        `*Message Types:*\n${typeBreakdown}`;

      await ctx.editMessageText(statsMessage, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Back to Settings", `settings_dashboard`)],
        ]),
      });
    } catch (error) {
      console.error("Show stats error:", error);
      await ctx.editMessageText("❌ Error loading statistics.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Back to Settings", `settings_dashboard`)],
        ]),
      });
    }
  };

  // ========== SHOW ADMINS ==========
  showAdmins = async (ctx, botId) => {
    try {
      const admins = await Admin.findAll({
        where: { bot_id: botId },
        include: [{ model: User, as: "AdminUser" }],
      });

      const bot = await Bot.findByPk(botId);

      let message =
        `👥 *Admin Management*\n\n` +
        `*Total Admins:* ${admins.length}\n\n` +
        `*Current Admins:*\n`;

      admins.forEach((admin, index) => {
        const userInfo = admin.AdminUser
          ? `@${admin.AdminUser.username} (${admin.AdminUser.first_name})`
          : `User#${admin.admin_user_id}`;

        const isOwner = admin.admin_user_id === bot.owner_id;

        message += `*${index + 1}.* ${userInfo} ${isOwner ? "👑 (Owner)" : ""}\n`;
      });

      const keyboardButtons = [];

      admins
        .filter((admin) => admin.admin_user_id !== bot.owner_id)
        .forEach((admin) => {
          keyboardButtons.push([
            Markup.button.callback(
              `➖ Remove ${admin.User?.username || `User#${admin.admin_user_id}`}`,
              `remove_admin_${admin.id}`,
            ),
          ]);
        });

      keyboardButtons.push(
        [Markup.button.callback("➕ Add Admin", "admin_add")],
        [Markup.button.callback("🔙 Dashboard", "mini_dashboard")],
      );

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      if (ctx.updateType === "callback_query") {
        await ctx.editMessageText(message, {
          parse_mode: "Markdown",
          ...keyboard,
        });
        await ctx.answerCbQuery();
      } else {
        await ctx.replyWithMarkdown(message, keyboard);
      }
    } catch (error) {
      console.error("Show admins error:", error);
      await ctx.reply("❌ Error loading admins.");
    }
  };

  // ========== REMOVE ADMIN ==========
  removeAdmin = async (ctx, botId, adminId) => {
    try {
      const admin = await Admin.findByPk(adminId);

      if (!admin) {
        await ctx.reply("❌ Admin not found.");
        return;
      }

      const bot = await Bot.findByPk(botId);

      if (admin.admin_user_id === bot.owner_id) {
        await ctx.reply("❌ Cannot remove bot owner.");
        return;
      }

      const adminUsername =
        admin.admin_username || `User#${admin.admin_user_id}`;

      await admin.destroy();

      const successMsg = await ctx.reply(
        `✅ Admin ${adminUsername} has been removed successfully.`,
      );
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);

      await this.showAdmins(ctx, botId);
    } catch (error) {
      console.error("Remove admin error:", error);
      await ctx.reply("❌ Error removing admin.");
    }
  };

  // ========== START ADD ADMIN ==========
  startAddAdmin = async (ctx, botId) => {
    try {
      this.adminSessions.set(ctx.from.id, {
        botId: botId,
        step: "awaiting_admin_input",
      });

      await ctx.reply(
        `👥 *Add New Admin*\n\n` +
          `Please send the new admin's Telegram *User ID* or *Username*:\n\n` +
          `*Cancel:* Type /cancel`,
        { parse_mode: "Markdown" },
      );
    } catch (error) {
      console.error("Start add admin error:", error);
      await ctx.reply("❌ Error adding admin");
    }
  };

  // ========== PROCESS ADD ADMIN ==========
  processAddAdmin = async (ctx, botId, input) => {
    try {
      let targetUserId;

      if (/^\d+$/.test(input)) {
        targetUserId = parseInt(input);
      } else {
        const username = input.replace("@", "");
        const user = await User.findOne({ where: { username: username } });
        if (!user) {
          await ctx.reply(
            `❌ User @${username} not found. Ask them to start @${this.mainBotUsername} first.`,
          );
          return;
        }
        targetUserId = user.telegram_id;
      }

      const ownerId = ctx.from.id;
      const limitCheck = await SubscriptionService.canUserAddCoAdmin(
        ownerId,
        botId,
      );

      if (!limitCheck.canAdd) {
        let message = `❌ *Cannot Add Co-Admin*\n\n`;

        if (limitCheck.tier === "freemium") {
          message +=
            `*Freemium users can only have ${limitCheck.limit} co-admin(s).*\n\n` +
            `💎 *Upgrade to Premium for unlimited co-admins!*\n` +
            `• All premium features`;

          await ctx.reply(message, {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.webApp(
                  "💎 Upgrade to Premium",
                  `${PUBLIC_URL}/wallet`,
                ),
              ],
              [Markup.button.callback("🔙 Back to Admins", `mini_admins`)],
            ]),
          });
        } else {
          message += limitCheck.reason || "Cannot add co-admin.";
          await ctx.reply(message);
        }
        return;
      }

      const existingAdmin = await Admin.findOne({
        where: { bot_id: botId, admin_user_id: targetUserId },
      });

      if (existingAdmin) {
        await ctx.reply("❌ This user is already an admin.");
        return;
      }

      const targetUser = await User.findOne({
        where: { telegram_id: targetUserId },
      });
      if (!targetUser) {
        await ctx.reply(
          `❌ User not found. Ask them to start @${this.mainBotUsername} first.`,
        );
        return;
      }

      await Admin.create({
        bot_id: botId,
        admin_user_id: targetUserId,
        admin_username: targetUser.username,
        added_by: ctx.from.id,
        permissions: {
          can_reply: true,
          can_broadcast: true,
          can_manage_admins: false,
          can_view_stats: true,
          can_deactivate: false,
        },
      });

      const userDisplay = targetUser.username
        ? `@${targetUser.username}`
        : `User#${targetUserId}`;

      const successMsg = await ctx.reply(
        `✅ *${userDisplay} added as admin!*\n\n` +
          `They can now reply to messages and send broadcasts.`,
        { parse_mode: "Markdown" },
      );

      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);
    } catch (error) {
      console.error("Process add admin error:", error);
      await ctx.reply("❌ Error adding admin.");
    }
  };

  // ========== HANDLE ADMIN ACTION ==========
  handleAdminAction = async (ctx) => {
    try {
      const action = ctx.match[1];
      const { metaBotInfo } = ctx;
      const user = ctx.from;

      await ctx.answerCbQuery();

      const isOwner = await this.checkOwnerAccess(
        metaBotInfo.mainBotId,
        user.id,
      );
      if (!isOwner) {
        await ctx.reply("❌ Only bot owner can manage admins.");
        return;
      }

      if (action === "add") {
        await this.startAddAdmin(ctx, metaBotInfo.mainBotId);
      }
    } catch (error) {
      console.error("Admin action error:", error);
      await ctx.reply("❌ Error processing admin action");
    }
  };

  // ========== HANDLE REMOVE ADMIN ACTION ==========
  handleRemoveAdminAction = async (ctx) => {
    try {
      const adminId = ctx.match[1];
      const { metaBotInfo } = ctx;
      const user = ctx.from;

      await ctx.answerCbQuery();

      const isOwner = await this.checkOwnerAccess(
        metaBotInfo.mainBotId,
        user.id,
      );
      if (!isOwner) {
        await ctx.reply("❌ Only bot owner can remove admins.");
        return;
      }

      await this.removeAdmin(ctx, metaBotInfo.mainBotId, adminId);
    } catch (error) {
      console.error("Remove admin action error:", error);
      await ctx.reply("❌ Error removing admin");
    }
  };

  // ========== HANDLE MINI ACTION ==========
  handleMiniAction = async (ctx) => {
    try {
      const action = ctx.match[1];
      const { metaBotInfo } = ctx;
      const user = ctx.from;

      await ctx.answerCbQuery();

      const isAdmin = await this.checkAdminAccess(
        metaBotInfo.mainBotId,
        user.id,
      );

      if (!isAdmin && !["about", "stats"].includes(action)) {
        await ctx.reply("❌ Admin access required.");
        return;
      }

      switch (action) {
        case "dashboard":
          await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
          break;
        case "broadcast":
          await this.startBroadcast(ctx, metaBotInfo.mainBotId);
          break;
        case "stats":
          await this.showStats(ctx, metaBotInfo.mainBotId);
          break;
        case "admins":
          const isOwner = await this.checkOwnerAccess(
            metaBotInfo.mainBotId,
            user.id,
          );
          if (isOwner) {
            await this.showAdmins(ctx, metaBotInfo.mainBotId);
          } else {
            await ctx.reply("❌ Only bot owner can manage admins.");
          }
          break;
        case "settings":
          const isOwnerForSettings = await this.checkOwnerAccess(
            metaBotInfo.mainBotId,
            user.id,
          );
          if (isOwnerForSettings) {
            await this.showSettings(ctx, metaBotInfo.mainBotId);
          } else {
            await ctx.reply("❌ Only bot owner can change settings.");
          }
          break;
        case "about":
          await this.showAbout(ctx, metaBotInfo);
          break;
        default:
          await ctx.reply("⚠️ Action not available");
      }
    } catch (error) {
      console.error("Mini action error:", error);
      await ctx.reply("❌ Error processing action");
    }
  };

  // ========== SHOW ABOUT ==========
  showAbout = async (ctx, metaBotInfo) => {
    try {
      const botRef = this.getBotReference();
      const aboutMessage =
        `ℹ️ *About ${metaBotInfo.botName}*\n\n` +
        `*Bot Username:* @${metaBotInfo.botUsername}\n` +
        `*Created via:* @${botRef.username}\n` +
        `*Create your own bot:* @${botRef.username}`;

      await ctx.replyWithMarkdown(aboutMessage);
    } catch (error) {
      console.error("About error:", error);
      await ctx.reply(`About ${metaBotInfo.botName}`);
    }
  };

  // ========== HANDLE TRANSFER OWNERSHIP ==========
  handleTransferOwnership = async (ctx, botId) => {
    try {
      const isOwner = await this.checkOwnerAccess(botId, ctx.from.id);
      if (!isOwner) {
        await ctx.editMessageText("❌ Only bot owner can transfer ownership.", {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🔙 Back to Settings",
                `settings_dashboard`,
              ),
            ],
          ]),
        });
        return;
      }

      this.transferOwnershipSessions.set(ctx.from.id, {
        botId: botId,
        step: "awaiting_new_owner",
        createdAt: Date.now(),
      });

      await ctx.editMessageText(
        `🔄 *Transfer Bot Ownership*\n\n` +
          `Please provide the Telegram User ID or Username of the new owner:\n\n` +
          `*Important:*\n` +
          `• The new owner must have started the main bot\n` +
          `• This action cannot be undone\n` +
          `• You will become a regular admin after transfer\n` +
          `• All bot data will be preserved\n\n` +
          `*To cancel:* Type /cancel or click the button below`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "❌ Cancel Transfer",
                `cancel_transfer_${botId}`,
              ),
            ],
          ]),
        },
      );
    } catch (error) {
      console.error("Transfer ownership error:", error);
      await ctx.reply("❌ Error starting ownership transfer.");
    }
  };

  // ========== PROCESS TRANSFER OWNERSHIP ==========
  processTransferOwnership = async (ctx, botId, newOwnerInput) => {
    try {
      // Check if user wants to cancel
      if (newOwnerInput.toLowerCase().trim() === "/cancel") {
        this.transferOwnershipSessions.delete(ctx.from.id);
        await ctx.reply("❌ Transfer cancelled.");
        await this.showSettings(ctx, botId);
        return;
      }

      let newOwnerId;

      if (/^\d+$/.test(newOwnerInput)) {
        newOwnerId = parseInt(newOwnerInput);
      } else {
        const username = newOwnerInput.replace("@", "");
        const user = await User.findOne({ where: { username: username } });
        if (!user) {
          await ctx.reply(
            `❌ User @${username} not found. Ask them to start the main bot first.`,
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    "❌ Cancel",
                    `cancel_transfer_${botId}`,
                  ),
                ],
              ]),
            },
          );
          return;
        }
        newOwnerId = user.telegram_id;
      }

      const newOwner = await User.findOne({
        where: { telegram_id: newOwnerId },
      });
      if (!newOwner) {
        await ctx.reply(
          `❌ User not found in our system. Ask them to start the main bot first.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("❌ Cancel", `cancel_transfer_${botId}`)],
            ]),
          },
        );
        return;
      }

      if (newOwnerId === ctx.from.id) {
        await ctx.reply("❌ You already own this bot.", {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("❌ Cancel", `cancel_transfer_${botId}`)],
          ]),
        });
        return;
      }

      const bot = await Bot.findByPk(botId);

      let originalCreatorId = bot.original_creator_id;
      if (!originalCreatorId) {
        originalCreatorId = bot.owner_id;
      }

      const ownershipHistory = bot.ownership_history || [];
      ownershipHistory.push({
        from_user_id: bot.owner_id,
        to_user_id: newOwnerId,
        transferred_at: new Date().toISOString(),
        transferred_by: ctx.from.id,
      });

      const oldOwnerId = bot.owner_id;
      await bot.update({
        owner_id: newOwnerId,
        original_creator_id: originalCreatorId,
        ownership_transferred: true,
        ownership_history: ownershipHistory,
      });

      await Admin.findOrCreate({
        where: {
          bot_id: botId,
          admin_user_id: oldOwnerId,
        },
        defaults: {
          admin_username: ctx.from.username,
          added_by: newOwnerId,
          permissions: {
            can_reply: true,
            can_broadcast: true,
            can_manage_admins: false,
            can_view_stats: true,
            can_deactivate: false,
            can_edit_bot: false,
            can_change_token: false,
          },
        },
      });

      await this.stopBot(botId);

      const botInstance = this.getBotInstanceByDbId(botId);
      if (botInstance) {
        await botInstance.telegram.sendMessage(
          newOwnerId,
          `🎉 *You are now the owner of ${bot.bot_name}!*\n\n` +
            `*Previous owner:* ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ""}\n` +
            `*Bot:* ${bot.bot_name} (@${bot.bot_username})\n\n` +
            `Please ask the person who have transferred you this bot, also must transfer you the actual bot from @BotFather\n\n` +
            `You now have full control over this bot. Use /dashboard to manage it.`,
          { parse_mode: "Markdown" },
        );
      }

      await this.initializeBot(bot);

      await ctx.editMessageText(
        `✅ *Ownership transferred successfully!*\n\n` +
          `*New owner:* ${newOwner.first_name}${newOwner.username ? ` (@${newOwner.username})` : ""}\n` +
          `*Bot:* ${bot.bot_name}\n\n` +
          `Please go to @BotFather and transfer the full ownership of the bot to the new owner.\n` +
          `You have been added as an admin with restricted permissions.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🔙 Back to Settings",
                `settings_dashboard`,
              ),
            ],
          ]),
        },
      );

      this.transferOwnershipSessions.delete(ctx.from.id);
    } catch (error) {
      console.error("Process transfer ownership error:", error);
      await ctx.reply("❌ Error transferring ownership.");
    }
  };

  // ========== BROADCAST METHODS ==========
  handleBroadcastCommand = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const isAdmin = await this.checkAdminAccess(
        metaBotInfo.mainBotId,
        ctx.from.id,
      );

      if (!isAdmin) {
        await ctx.reply("❌ Admin access required.");
        return;
      }

      await this.startBroadcast(ctx, metaBotInfo.mainBotId);
    } catch (error) {
      console.error("Broadcast command error:", error);
      await ctx.reply("❌ Error starting broadcast.");
    }
  };

  handleStatsCommand = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      await this.showStats(ctx, metaBotInfo.mainBotId);
    } catch (error) {
      console.error("Stats command error:", error);
      await ctx.reply("❌ Error loading statistics.");
    }
  };

  handleAdminsCommand = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const isOwner = await this.checkOwnerAccess(
        metaBotInfo.mainBotId,
        ctx.from.id,
      );

      if (!isOwner) {
        await ctx.reply("❌ Only bot owner can manage admins.");
        return;
      }

      await this.showAdmins(ctx, metaBotInfo.mainBotId);
    } catch (error) {
      console.error("Admins command error:", error);
      await ctx.reply("❌ Error loading admins.");
    }
  };

  handleSettingsCommand = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const isOwner = await this.checkOwnerAccess(
        metaBotInfo.mainBotId,
        ctx.from.id,
      );

      if (!isOwner) {
        await ctx.reply("❌ Only bot owner can change settings.");
        return;
      }

      await this.showSettings(ctx, metaBotInfo.mainBotId);
    } catch (error) {
      console.error("Settings command error:", error);
      await ctx.reply("❌ Error loading settings.");
    }
  };

  startBroadcast = async (ctx, botId) => {
    try {
      const userId = ctx.from.id;

      const isAdmin = await this.checkAdminAccess(botId, userId);
      if (!isAdmin) {
        await ctx.reply("❌ Admin access required.");
        return;
      }

      const broadcastCheck = await SubscriptionService.canUserBroadcast(
        userId,
        botId,
      );

      if (!broadcastCheck.canBroadcast) {
        await ctx.editMessageText(
          `❌ *Weekly Broadcast Limit Reached*\n\n` +
            `You have used ${broadcastCheck.currentCount}/${broadcastCheck.weeklyLimit} broadcasts this week.\n\n` +
            `*Freemium:* 3 broadcasts per week\n` +
            `*Premium:* Unlimited broadcasts\n\n` +
            `💎 Upgrade to Premium for unlimited broadcasts!\n\n` +
            `*Reset:* ${this.getNextResetDate()}`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.webApp(
                  "💎 Upgrade to Premium",
                  `${PUBLIC_URL}/wallet`,
                ),
              ],
              [Markup.button.callback("🔙 Dashboard", "mini_dashboard")],
            ]),
          },
        );
        return;
      }

      const userCount = await UserLog.count({ where: { bot_id: botId } });

      if (userCount === 0) {
        await ctx.editMessageText("❌ No users found for broadcasting.", {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🔙 Dashboard", "mini_dashboard")],
          ]),
        });
        return;
      }

      this.broadcastSessions.set(userId, {
        botId: botId,
        step: "awaiting_message",
        broadcastCheck: broadcastCheck,
        createdAt: Date.now(),
      });

      await ctx.editMessageText(
        `📢 *Send Broadcast*\n\n` +
          `*Recipients:* ${userCount} users\n` +
          `Please type your broadcast message:\n\n` +
          `*Note:* You can use Markdown formatting\n\n` +
          `*To cancel:* Type /cancel`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("❌ Cancel", `cancel_broadcast_${botId}`)],
          ]),
        },
      );
    } catch (error) {
      console.error("Start broadcast error:", error);
      await ctx.reply("❌ Error starting broadcast.");
    }
  };

  getNextResetDate() {
    const now = new Date();
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + ((((7 - now.getDay()) % 7) + 1) % 7));
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday.toLocaleDateString();
  }

  sendBroadcastWithConfirmation = async (ctx, botId, message) => {
    try {
      const userId = ctx.from.id;

      console.log(
        `📢 Creating/updating broadcast session for user ${userId}, bot ${botId}`,
      );
      console.log(`📝 Message length: ${message.length} characters`);

      let session = this.broadcastSessions.get(userId);

      if (session) {
        console.log(`📝 Updating existing session with message`);
        session.botId = String(botId);
        session.message = message;
        session.step = "awaiting_confirmation";
        session.chatId = ctx.chat.id;
        session.createdAt = Date.now();
      } else {
        console.log(`📝 Creating new session with message`);
        session = {
          botId: String(botId),
          message: message,
          step: "awaiting_confirmation",
          createdAt: Date.now(),
          chatId: ctx.chat.id,
        };
      }

      this.broadcastSessions.set(userId, session);

      // ========== FIX: Use reply instead of editMessageText ==========
      // Try to delete the original message if it exists
      try {
        if (ctx.message) {
          await ctx.deleteMessage(ctx.message.message_id);
        }
        if (ctx.callbackQuery?.message) {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        }
      } catch (e) {
        // Message already deleted or not accessible - ignore
        console.log("ℹ️ Could not delete original message, continuing...");
      }

      // Send NEW confirmation message
      const confirmationMessage = await ctx.reply(
        `*Message Preview:*\n` +
          `\`\`\`\n${message.substring(0, 300)}${message.length > 300 ? "..." : ""}\n\`\`\`\n\n` +
          `*Are you sure you want to send this to all users?*`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "✅ Yes, Send Broadcast",
                `confirm_broadcast_${botId}`,
              ),
            ],
            [Markup.button.callback("❌ Cancel", `cancel_broadcast_${botId}`)],
          ]),
        },
      );

      // Store the confirmation message ID for later deletion
      session.confirmationMessageId = confirmationMessage.message_id;
      this.broadcastSessions.set(userId, session);

      console.log(
        `✅ Confirmation shown for user ${userId}, message ID: ${confirmationMessage.message_id}`,
      );
    } catch (error) {
      console.error("Send broadcast confirmation error:", error);
      await ctx.reply("❌ Error preparing broadcast.");
    }
  };

  handleBroadcastConfirmation = async (ctx, botId) => {
    try {
      const userId = ctx.from.id;
      console.log(
        `\n📢 Processing broadcast confirmation for user ${userId}, bot ${botId}`,
      );

      const session = this.broadcastSessions.get(userId);

      if (!session) {
        console.log(`❌ No broadcast session found for user ${userId}`);
        await ctx.answerCbQuery(
          "❌ No active broadcast session found. Please start a new broadcast.",
        );
        return;
      }

      // Validate session data
      if (
        !session.message ||
        typeof session.message !== "string" ||
        session.message.trim().length === 0
      ) {
        console.error(`❌ Invalid message in session:`, session.message);
        await ctx.answerCbQuery(
          "❌ Error: Broadcast message is empty. Please start over.",
        );
        this.broadcastSessions.delete(userId);
        return;
      }

      const sessionBotId = String(session.botId);
      const requestBotId = String(botId);

      if (
        session.step !== "awaiting_confirmation" ||
        sessionBotId !== requestBotId
      ) {
        console.log(`❌ Invalid session state for user ${userId}`);
        await ctx.answerCbQuery(
          "❌ Invalid broadcast session. Please start a new broadcast.",
        );
        return;
      }

      await ctx.answerCbQuery("📢 Starting broadcast...");

      // Delete confirmation message if possible
      if (session.confirmationMessageId && session.chatId) {
        try {
          await ctx.telegram.deleteMessage(
            session.chatId,
            session.confirmationMessageId,
          );
          console.log(`🗑️ Deleted confirmation message for user ${userId}`);
        } catch (error) {
          console.log(
            "⚠️ Confirmation message already deleted or not accessible",
          );
        }
      }

      // Store message before clearing session
      const broadcastMessage = session.message;
      console.log(
        `📝 Broadcasting message: "${broadcastMessage.substring(0, 50)}..."`,
      );

      // Clear session BEFORE processing to prevent re-entry
      this.broadcastSessions.delete(userId);
      console.log(`✅ Broadcast session cleared for user ${userId}`);

      // Start actual broadcast
      await this.processBroadcastSend(ctx, botId, broadcastMessage);
    } catch (error) {
      console.error("Broadcast confirmation error:", error);
      await ctx.answerCbQuery("❌ Error processing broadcast");
    }
  };

  handleBroadcastCancellation = async (ctx, botId) => {
    try {
      const userId = ctx.from.id;
      console.log(
        `❌ Processing broadcast cancellation for user ${userId}, bot ${botId}`,
      );

      const session = this.broadcastSessions.get(userId);

      if (!session) {
        console.log(`❌ No broadcast session found for user ${userId}`);
        await ctx.answerCbQuery("❌ No active broadcast session.");
        return;
      }

      // Compare as strings
      const sessionBotId = String(session.botId);
      const requestBotId = String(botId);

      if (sessionBotId !== requestBotId) {
        console.log(
          `❌ Session botId mismatch: ${sessionBotId} vs ${requestBotId}`,
        );
        await ctx.answerCbQuery("❌ Invalid broadcast session");
        return;
      }

      // Delete confirmation message if exists
      if (session.confirmationMessageId && session.chatId) {
        try {
          await ctx.telegram.deleteMessage(
            session.chatId,
            session.confirmationMessageId,
          );
          console.log(`🗑️ Deleted confirmation message for user ${userId}`);
        } catch (error) {
          console.log(
            "⚠️ Confirmation message already deleted or not accessible",
          );
        }
      }

      // Clear session
      this.broadcastSessions.delete(userId);
      console.log(`✅ Broadcast session cancelled for user ${userId}`);

      await ctx.answerCbQuery("❌ Broadcast cancelled");

      // Send auto-deleting cancellation message
      const msg = await ctx.reply("❌ Broadcast cancelled.");
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(msg.message_id);
        } catch (e) {
          // Message already deleted
        }
      }, 3000);

      // Return to dashboard
      await this.showSimplifiedAdminDashboard(ctx, ctx.metaBotInfo);
    } catch (error) {
      console.error("Broadcast cancellation error:", error);
      await ctx.answerCbQuery("❌ Error cancelling broadcast");
    }
  };

  // ========== TEXT MESSAGE HANDLER ==========
  handleTextMessage = async (ctx) => {
    try {
      const user = ctx.from;
      const message = ctx.message.text;
      const { metaBotInfo } = ctx;

      // Handle /cancel for all sessions
      if (message.trim().toLowerCase() === "/cancel") {
        const userId = user.id;
        let cancelled = false;
        let botId = metaBotInfo?.mainBotId;

        // Check broadcast session
        if (this.broadcastSessions.has(userId)) {
          this.broadcastSessions.delete(userId);
          cancelled = true;
          const cancelMsg = await ctx.reply("❌ Broadcast cancelled.");
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(cancelMsg.message_id);
            } catch (e) {}
          }, 2000);
          setTimeout(async () => {
            await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
          }, 300);
          return;
        }

        // Check welcome session
        if (this.welcomeMessageSessions.has(userId)) {
          const session = this.welcomeMessageSessions.get(userId);
          this.welcomeMessageSessions.delete(userId);
          cancelled = true;
          const cancelMsg = await ctx.reply("❌ Welcome change cancelled.");
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(cancelMsg.message_id);
            } catch (e) {}
          }, 2000);
          setTimeout(async () => {
            await this.showSettings(ctx, session.botId);
          }, 300);
          return;
        }

        // Check transfer session
        if (this.transferOwnershipSessions.has(userId)) {
          const session = this.transferOwnershipSessions.get(userId);
          this.transferOwnershipSessions.delete(userId);
          cancelled = true;
          const cancelMsg = await ctx.reply("❌ Transfer cancelled.");
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(cancelMsg.message_id);
            } catch (e) {}
          }, 2000);
          setTimeout(async () => {
            await this.showSettings(ctx, session.botId);
          }, 300);
          return;
        }

        // Check donation session
        if (this.donationSessions.has(userId)) {
          const session = this.donationSessions.get(userId);
          this.donationSessions.delete(userId);
          cancelled = true;
          const cancelMsg = await ctx.reply("❌ Donation cancelled.");
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(cancelMsg.message_id);
            } catch (e) {}
          }, 2000);
          setTimeout(async () => {
            await this.handleDonation(ctx, session.botId);
          }, 300);
          return;
        }

        // Check reply session
        if (this.replySessions.has(userId)) {
          this.replySessions.delete(userId);
          cancelled = true;
          const cancelMsg = await ctx.reply("❌ Reply cancelled.");
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(cancelMsg.message_id);
            } catch (e) {}
          }, 2000);
          setTimeout(async () => {
            await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
          }, 300);
          return;
        }

        // Check admin session
        if (this.adminSessions.has(userId)) {
          this.adminSessions.delete(userId);
          cancelled = true;
          const cancelMsg = await ctx.reply("❌ Admin addition cancelled.");
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(cancelMsg.message_id);
            } catch (e) {}
          }, 2000);
          setTimeout(async () => {
            await this.showAdmins(ctx, metaBotInfo?.mainBotId);
          }, 300);
          return;
        }

        // Check product session
        if (this.productCatalogSessions.has(userId)) {
          this.productCatalogSessions.delete(userId);
          cancelled = true;
          const cancelMsg = await ctx.reply("❌ Product action cancelled.");
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(cancelMsg.message_id);
            } catch (e) {}
          }, 2000);
          setTimeout(async () => {
            await this.showSettings(ctx, metaBotInfo?.mainBotId);
          }, 300);
          return;
        }

        if (!cancelled) {
          const cancelMsg = await ctx.reply("❌ No active action to cancel.");
          setTimeout(async () => {
            try {
              await ctx.deleteMessage(cancelMsg.message_id);
            } catch (e) {}
          }, 2000);
        }
        return;
      }

      // Check broadcast session
      const broadcastSession = this.broadcastSessions.get(user.id);
      if (broadcastSession && broadcastSession.step === "awaiting_message") {
        await this.sendBroadcastWithConfirmation(
          ctx,
          broadcastSession.botId,
          message,
        );
        broadcastSession.step = "awaiting_confirmation";
        broadcastSession.message = message;
        this.broadcastSessions.set(user.id, broadcastSession);
        return;
      }

      // Check donation session
      const donationSession = this.donationSessions.get(user.id);
      if (
        donationSession &&
        donationSession.step === "awaiting_custom_amount"
      ) {
        const amount = parseFloat(message);
        if (isNaN(amount) || amount <= 0) {
          await ctx.reply(
            "❌ Please enter a valid amount in BOM (e.g., 2.5, 15, 100):\n\n" +
              "*To cancel:* Type /cancel",
            { parse_mode: "Markdown" },
          );
          return;
        }

        await this.processDonation(ctx, donationSession.botId, amount);
        this.donationSessions.delete(user.id);
        return;
      }

      // Check welcome session
      const welcomeSession = this.welcomeMessageSessions.get(user.id);
      if (
        welcomeSession &&
        welcomeSession.step === "awaiting_welcome_message"
      ) {
        await this.processWelcomeMessageChange(
          ctx,
          welcomeSession.botId,
          message,
        );
        this.welcomeMessageSessions.delete(user.id);
        return;
      }

      // Check transfer session
      const transferSession = this.transferOwnershipSessions.get(user.id);
      if (transferSession && transferSession.step === "awaiting_new_owner") {
        await this.processTransferOwnership(
          ctx,
          transferSession.botId,
          message,
        );
        this.transferOwnershipSessions.delete(user.id);
        return;
      }

      // Check reply session
      const replySession = this.replySessions.get(user.id);
      if (replySession && replySession.step === "awaiting_reply") {
        await this.sendReply(
          ctx,
          replySession.feedbackId,
          replySession.userId,
          message,
        );
        this.replySessions.delete(user.id);
        return;
      }

      // Check admin session
      const adminSession = this.adminSessions.get(user.id);
      if (adminSession && adminSession.step === "awaiting_admin_input") {
        await this.processAddAdmin(ctx, adminSession.botId, message);
        this.adminSessions.delete(user.id);
        return;
      }

      // Check product session
      const productSession = this.productCatalogSessions.get(user.id);
      if (productSession) {
        await this.processProductCatalogInput(ctx, productSession, message);
        return;
      }

      // Check if admin
      const isAdmin = await this.checkAdminAccess(
        metaBotInfo.mainBotId,
        user.id,
      );
      if (isAdmin) {
        await this.showSimplifiedAdminDashboard(ctx, metaBotInfo);
        return;
      }

      // Regular user message
      await this.handleUserMessage(ctx, metaBotInfo, user, message);
    } catch (error) {
      console.error("Text message handler error:", error);
      await ctx.reply("❌ An error occurred. Please try again.");
    }
  };

  // ========== USER MESSAGE HANDLER ==========
  handleUserMessage = async (ctx, metaBotInfo, user, message) => {
    try {
      await UserLog.upsert({
        bot_id: metaBotInfo.mainBotId,
        user_id: user.id,
        user_username: user.username,
        user_first_name: user.first_name,
        last_interaction: new Date(),
      });

      const feedback = await Feedback.create({
        // Do NOT include 'id' field - let Sequelize auto-generate it
        bot_id: metaBotInfo.mainBotId,
        user_id: user.id,
        user_username: user.username,
        user_first_name: user.first_name,
        message: message,
        message_id: ctx.message.message_id,
        message_type: "text",
      });

      await this.notifyAdminsRealTime(
        metaBotInfo.mainBotId,
        feedback,
        user,
        "text",
        ctx.message,
      );

      const successMsg = await ctx.reply("✅ Your message has been received.");
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);
    } catch (error) {
      console.error("User message handler error:", error);
      await ctx.reply(
        "❌ Sorry, there was an error sending your message. Please try again.",
      );
    }
  };

  // ========== SEND REPLY ==========
  sendReply = async (ctx, feedbackId, userId, replyText) => {
    try {
      const feedback = await Feedback.findByPk(feedbackId);
      if (!feedback) {
        await ctx.reply("❌ Message not found.");
        return;
      }

      const botInstance = this.getBotInstanceByDbId(feedback.bot_id);

      if (!botInstance) {
        await ctx.reply("❌ Bot not active. Please restart the main bot.");
        return;
      }

      await botInstance.telegram.sendMessage(
        userId,
        `💬 *Reply from admin:*\n\n${replyText}\n\n` +
          `_This is a reply to your message_`,
        { parse_mode: "Markdown" },
      );

      await feedback.update({
        is_replied: true,
        reply_message: replyText,
        replied_by: ctx.from.id,
        replied_at: new Date(),
      });

      const successMsg = await ctx.reply("✅ Reply sent successfully!");
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);
    } catch (error) {
      console.error("Send reply error:", error);
      await ctx.reply(
        "❌ Error sending reply. User might have blocked the bot.",
      );
    }
  };

  // ========== START REPLY ==========
  startReply = async (ctx, feedbackId) => {
    try {
      const feedback = await Feedback.findByPk(feedbackId);
      if (!feedback) {
        await ctx.reply("❌ Message not found");
        return;
      }

      this.replySessions.set(ctx.from.id, {
        feedbackId: feedbackId,
        userId: feedback.user_id,
        step: "awaiting_reply",
      });

      await ctx.reply(
        `💬 *Replying to ${feedback.user_first_name}*\n\n` +
          `Please type your reply message:\n\n` +
          `*Cancel:* Type /cancel`,
        { parse_mode: "Markdown" },
      );
    } catch (error) {
      console.error("Start reply error:", error);
      await ctx.reply("❌ Error starting reply");
    }
  };

  // ========== NOTIFY ADMINS ==========
  notifyAdminsRealTime = async (
    botId,
    feedback,
    user,
    messageType = "text",
    originalMessage = null,
  ) => {
    try {
      const admins = await Admin.findAll({
        where: { bot_id: botId },
        include: [{ model: User, as: "AdminUser" }],
      });

      const bot = await Bot.findByPk(botId);
      const botInstance = this.getBotInstanceByDbId(botId);

      if (!botInstance) {
        console.error("❌ Bot instance not found for real-time notification");
        return;
      }

      const mediaEmoji = this.getMediaTypeEmoji(messageType);
      const mediaTypeText =
        messageType === "text"
          ? "Message"
          : messageType.charAt(0).toUpperCase() + messageType.slice(1);

      const allAdmins = [...admins];

      const ownerIsAdmin = admins.find(
        (admin) => admin.admin_user_id === bot.owner_id,
      );
      if (!ownerIsAdmin) {
        const owner = await User.findOne({
          where: { telegram_id: bot.owner_id },
        });
        if (owner) {
          allAdmins.push({ AdminUser: owner });
        }
      }

      let notificationSent = false;

      for (const admin of allAdmins) {
        if (admin.AdminUser) {
          try {
            let notificationMessage =
              `🔔 *New ${mediaTypeText} Received*\n\n` +
              `*From:* ${user.first_name}${user.username ? ` (@${user.username})` : ""}\n`;

            if (messageType === "text") {
              notificationMessage += `*Message:* ${feedback.message}`;
            } else {
              notificationMessage +=
                `*Caption:* ${feedback.media_caption || "[No caption]"}\n` +
                `*Type:* ${messageType}`;
            }

            await botInstance.telegram.sendMessage(
              admin.AdminUser.telegram_id,
              notificationMessage,
              {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                  [
                    Markup.button.callback(
                      "📩 Reply Now",
                      `reply_${feedback.id}`,
                    ),
                  ],
                ]),
              },
            );
            notificationSent = true;
          } catch (error) {
            console.error(
              `Failed to notify admin ${admin.AdminUser.username || admin.AdminUser.telegram_id}:`,
              error.message,
            );
          }
        }
      }
    } catch (error) {
      console.error("Real-time notification error:", error);
    }
  };

  // ========== GET MEDIA TYPE EMOJI ==========
  getMediaTypeEmoji = (messageType) => {
    const emojiMap = {
      text: "💬",
      image: "🖼️",
      video: "🎥",
      document: "📎",
      media_group: "🖼️",
      audio: "🎵",
      voice: "🎤",
      sticker: "🤡",
    };
    return emojiMap[messageType] || "📄";
  };

  // ========== DONATION HANDLERS ==========
  handleDonation = async (ctx, botId = null) => {
    try {
      const targetBotId = botId || ctx.metaBotInfo?.mainBotId;
      const bot = await Bot.findByPk(targetBotId);

      if (!bot) {
        await ctx.reply("❌ Bot not found.");
        return;
      }

      if (!bot.has_donation_enabled) {
        await ctx.reply("❌ Donation system is not enabled for this bot.");
        return;
      }

      const donorBalance = await WalletService.getBalance(ctx.from.id);

      const message =
        `☕ *Support ${bot.bot_name}*\n\n` +
        `Support this bot by sending a donation in BOM!\n\n` +
        `*All donations go directly to this bot owner*\n\n` +
        `*Your balance:* ${donorBalance.balance.toFixed(2)} BOM`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback("1 BOM ☕", `donate_${bot.id}_1`),
          Markup.button.callback("5 BOM 🍵", `donate_${bot.id}_5`),
        ],
        [
          Markup.button.callback("10 BOM 🍲", `donate_${bot.id}_10`),
          Markup.button.callback("20 BOM 🎁", `donate_${bot.id}_20`),
        ],
        [
          Markup.button.callback("Custom Amount", `donate_custom_${bot.id}`),
          Markup.button.callback("🔙 Back", `catalog_${bot.id}`),
        ],
      ]);

      await ctx.replyWithMarkdown(message, keyboard);
    } catch (error) {
      console.error("Donation handler error:", error);
      await ctx.reply("❌ Error loading donation options.");
    }
  };

  processDonation = async (ctx, botId, amount) => {
    try {
      const numericBotId = parseInt(botId);
      if (isNaN(numericBotId)) {
        await ctx.reply("❌ Invalid bot configuration.");
        return;
      }

      const bot = await Bot.findByPk(numericBotId);
      if (!bot) {
        await ctx.reply("❌ Bot not found.");
        return;
      }

      if (!bot.has_donation_enabled) {
        await ctx.reply("❌ Donation system is not enabled for this bot.");
        return;
      }

      if (isNaN(amount) || amount <= 0) {
        await ctx.reply("❌ Invalid donation amount.");
        return;
      }

      const donorBalance = await WalletService.getBalance(ctx.from.id);
      if (donorBalance.balance < amount) {
        await ctx.reply(
          `❌ Insufficient balance. You need ${amount} BOM but only have ${donorBalance.balance.toFixed(2)} BOM.`,
        );
        return;
      }

      const transferResult = await WalletService.transfer(
        ctx.from.id,
        bot.owner_id,
        amount,
        `Donation to ${bot.bot_name}`,
      );

      if (!transferResult.success) {
        throw new Error("Transfer failed");
      }

      try {
        const botInstance = this.getBotInstanceByDbId(bot.id);
        if (botInstance) {
          await botInstance.telegram.sendMessage(
            bot.owner_id,
            `🎉 *You received a donation!*\n\n` +
              `*From:* ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ""}\n` +
              `*Amount:* ${amount} BOM ($${amount}.00)\n` +
              `*Fee:* ${transferResult.fee || 0} BOM\n` +
              `*Net Received:* ${transferResult.netAmount || amount} BOM\n` +
              `*Bot:* ${bot.bot_name}\n\n` +
              `💝 Thank you for creating great bots!`,
            { parse_mode: "Markdown" },
          );
        }
      } catch (notificationError) {
        console.error("Failed to notify bot owner:", notificationError);
      }

      await ctx.reply(
        `🎉 *Thank you for your donation!*\n\n` +
          `You donated ${amount} BOM to ${bot.bot_name}.\n` +
          `*Fee:* ${transferResult.fee || 0} BOM (${transferResult.feePercentage || 1}%)\n` +
          `*Net received:* ${transferResult.netAmount || amount} BOM\n\n` +
          `The bot owner has been notified of your generosity!\n\n` +
          `*Your new balance:* ${(donorBalance.balance - amount).toFixed(2)} BOM`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🔙 Go Back", `donate_menu_${bot.id}`)],
          ]),
        },
      );
    } catch (error) {
      console.error("Process donation error:", error);
      await ctx.reply("❌ Error processing donation. Please try again.");
    }
  };

  // ========== PRODUCT CATALOG ==========
  handleProductCatalog = async (ctx, botId) => {
    try {
      const { metaBotInfo } = ctx;
      const userId = ctx.from.id;

      const isAdmin = await this.checkAdminAccess(botId, userId);

      const ProductCatalogService = require("./productCatalogService");
      const productsResult = await ProductCatalogService.getProducts(botId);

      if (!productsResult.success) {
        await ctx.editMessageText("❌ Error loading products.", {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🔙 Back to Settings",
                `settings_dashboard`,
              ),
            ],
          ]),
        });
        return;
      }

      const products = productsResult.products || [];

      let message = `🛍️ *Product Catalog*\n\n`;

      if (products.length === 0) {
        message += `No products available yet.\n\n`;

        if (isAdmin) {
          const permission =
            await ProductCatalogService.canUseProductCatalog(botId);
          if (permission.canUse) {
            message +=
              `*As an admin, you can:*\n` +
              `• Add products to sell\n` +
              `• Manage orders\n` +
              `• Track sales\n`;
          } else {
            // Premium lock message with proper buttons
            await ctx.editMessageText(
              `🛍️ *Product Catalog*\n\n` +
                `❌ *Premium Feature Required*\n\n` +
                `The Product Catalog is available for premium users only.\n\n` +
                `💎 *Upgrade to Premium for:*\n` +
                `• Create product catalog\n` +
                `• Sell products\n` +
                `• Manage orders\n` +
                `• Track sales\n` +
                `• All premium features\n\n` +
                `*Price:* 3 BOM per month ($3.00)`,
              {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                  [
                    Markup.button.webApp(
                      "💎 Upgrade to Premium",
                      `${PUBLIC_URL}/wallet`,
                    ),
                  ],
                  [
                    Markup.button.callback(
                      "🔙 Back to Settings",
                      `settings_dashboard`,
                    ),
                  ],
                ]),
              },
            );
            return;
          }
        } else {
          message += `Check back later for products!\n`;
          await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "🔙 Back to Settings",
                  `settings_dashboard`,
                ),
              ],
            ]),
          });
          return;
        }
      } else {
        message += `*Available Products:*\n\n`;

        products.forEach((product, index) => {
          const stockInfo =
            product.stock_quantity === null
              ? "Unlimited"
              : `${product.stock_quantity} in stock`;

          message +=
            `*${index + 1}. ${product.name}*\n` +
            `💰 ${product.price} ${product.currency}\n` +
            `📦 ${stockInfo}\n` +
            `${product.is_digital ? "📱 Digital Product\n" : ""}` +
            `\n`;
        });

        message +=
          `*Total:* ${products.length} products\n\n` +
          `*Note:* All purchases use BOM currency (1 BOM = $1.00 USD)`;
      }

      const keyboardButtons = [];

      products.slice(0, 5).forEach((product) => {
        keyboardButtons.push([
          Markup.button.callback(
            `🛒 ${product.name} - ${product.price} BOM`,
            `product_view_${product.id}`,
          ),
        ]);
      });

      if (isAdmin) {
        const permission =
          await ProductCatalogService.canUseProductCatalog(botId);
        if (permission.canUse) {
          keyboardButtons.push([
            Markup.button.callback("➕ Add Product", `product_add_${botId}`),
            Markup.button.callback(
              "📦 Manage Products",
              `product_manage_${botId}`,
            ),
          ]);

          keyboardButtons.push([
            Markup.button.callback(
              "📊 Manage Orders",
              `orders_manage_${botId}`,
            ),
            Markup.button.callback("📈 Sales Stats", `catalog_stats_${botId}`),
          ]);
        }
      }

      // Always add Back to Settings button
      keyboardButtons.push([
        Markup.button.callback("🔙 Back to Settings", `settings_dashboard`),
      ]);

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        ...keyboard,
      });
    } catch (error) {
      console.error("Handle product catalog error:", error);
      await ctx.editMessageText("❌ Error loading product catalog.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Back to Settings", `settings_dashboard`)],
        ]),
      });
    }
  };

  handleProductView = async (ctx, productId) => {
    try {
      const ProductCatalogService = require("./productCatalogService");
      const { ProductCatalog } = require("../models");

      const product = await ProductCatalog.findByPk(productId);
      if (!product) {
        await ctx.answerCbQuery("❌ Product not found");
        return;
      }

      if (!product.is_active) {
        await ctx.answerCbQuery("❌ Product not available");
        return;
      }

      const stockInfo =
        product.stock_quantity === null
          ? "Unlimited stock"
          : `${product.stock_quantity} available`;

      let message =
        `🛍️ *${product.name}*\n\n` +
        `*Price:* ${product.price} ${product.currency} ($${product.price}.00 USD)\n` +
        `*Stock:* ${stockInfo}\n` +
        `*Type:* ${product.is_digital ? "📱 Digital Product" : "📦 Physical Product"}\n\n`;

      if (product.description) {
        message += `*Description:*\n${product.description}\n\n`;
      }

      message +=
        `*How to buy:*\n` +
        `1. Click a quantity button below\n` +
        `2. Confirm purchase\n` +
        `3. Payment will be processed from your BOM wallet\n` +
        `4. Seller will process your order\n\n` +
        `*Note:* Requires BOM balance`;

      const keyboardButtons = [];

      if (product.stock_quantity === null || product.stock_quantity >= 1) {
        keyboardButtons.push([
          Markup.button.callback("1️⃣ Buy 1", `product_buy_${product.id}_1`),
          Markup.button.callback("2️⃣ Buy 2", `product_buy_${product.id}_2`),
          Markup.button.callback("3️⃣ Buy 3", `product_buy_${product.id}_3`),
        ]);

        if (product.stock_quantity === null || product.stock_quantity >= 5) {
          keyboardButtons.push([
            Markup.button.callback("5️⃣ Buy 5", `product_buy_${product.id}_5`),
            Markup.button.callback(
              "🔢 Custom Qty",
              `product_custom_${product.id}`,
            ),
          ]);
        }
      }

      keyboardButtons.push([
        Markup.button.callback(
          "🔙 Back to Catalog",
          `catalog_${product.bot_id}`,
        ),
        Markup.button.callback("📋 My Orders", `my_orders_${ctx.from.id}`),
      ]);

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      if (product.image_file_id) {
        try {
          if (ctx.updateType === "callback_query") {
            await ctx.deleteMessage();
          }

          await ctx.replyWithPhoto(product.image_file_id, {
            caption: message,
            parse_mode: "Markdown",
            ...keyboard,
          });
        } catch (photoError) {
          console.error("Error sending product photo:", photoError);
          if (ctx.updateType === "callback_query") {
            await ctx.editMessageText(message, {
              parse_mode: "Markdown",
              ...keyboard,
            });
          } else {
            await ctx.replyWithMarkdown(message, keyboard);
          }
        }
      } else {
        if (ctx.updateType === "callback_query") {
          await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        } else {
          await ctx.replyWithMarkdown(message, keyboard);
        }
      }

      await ctx.answerCbQuery();
    } catch (error) {
      console.error("Product view error:", error);
      await ctx.answerCbQuery("❌ Error loading product");
    }
  };

  handleProductPurchase = async (ctx, productId, quantity) => {
    try {
      const userId = ctx.from.id;
      const ProductCatalogService = require("./productCatalogService");

      if (ctx.updateType === "callback_query") {
        await ctx.answerCbQuery("🔄 Processing purchase...");
      }

      const walletService = require("./walletService");
      const balance = await walletService.getBalance(userId);

      const product =
        await require("../models").ProductCatalog.findByPk(productId);
      if (!product) {
        if (ctx.updateType === "callback_query") {
          await ctx.answerCbQuery("❌ Product not found");
        } else {
          await ctx.reply("❌ Product not found.");
        }
        return;
      }

      const totalAmount = parseFloat(product.price) * quantity;

      if (balance.balance < totalAmount) {
        const message =
          `❌ *Insufficient Balance*\n\n` +
          `You need ${totalAmount} BOM but only have ${balance.balance.toFixed(2)} BOM.\n\n` +
          `*To get BOM:*\n` +
          `1. Contact @BotomicsSupportBot to buy BOM\n` +
          `2. Deposit into your wallet\n` +
          `3. Try again with sufficient balance\n\n` +
          `*Rate:* 1 BOM = $1.00 USD\n` +
          `*Minimum purchase:* 5 BOM ($5.00)`;

        const keyboard = Markup.inlineKeyboard([
          [
            Markup.button.webApp(
              "💰 Add BOM to Wallet",
              `${PUBLIC_URL}/wallet`,
            ),
          ],
          [Markup.button.callback("🔙 Back", `product_view_${productId}`)],
        ]);

        if (ctx.updateType === "callback_query") {
          try {
            await ctx.editMessageText(message, {
              parse_mode: "Markdown",
              ...keyboard,
            });
          } catch (editError) {
            await ctx.reply(message, {
              parse_mode: "Markdown",
              ...keyboard,
            });
          }
        } else {
          await ctx.reply(message, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        }
        return;
      }

      if (balance.isFrozen) {
        await ctx.reply(
          "❌ *Wallet Frozen*\n\n" +
            "Your wallet is frozen. Please contact support @BotomicsSupportBot.",
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("🔙 Back", `product_view_${productId}`)],
            ]),
          },
        );
        return;
      }

      const purchaseResult = await ProductCatalogService.purchaseProduct(
        productId,
        userId,
        quantity,
      );

      if (purchaseResult.success) {
        let successMessage =
          `✅ *Purchase Successful!*\n\n` +
          `*Product:* ${product.name}\n` +
          `*Quantity:* ${quantity}\n` +
          `*Total:* ${totalAmount} BOM ($${totalAmount}.00)\n` +
          `*Order #:* ${purchaseResult.order.order_number}\n\n` +
          (product.is_digital
            ? `*Status:* Paid - Seller will deliver digital content shortly.\n`
            : `*Status:* Paid - Seller will process your order.\n`) +
          `\nYou will be notified when your order status changes.`;

        const keyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🛍️ Continue Shopping",
              `catalog_${product.bot_id}`,
            ),
          ],
          [Markup.button.callback("📋 My Orders", `my_orders_${userId}`)],
        ]);

        if (ctx.updateType === "callback_query") {
          try {
            await ctx.editMessageText(successMessage, {
              parse_mode: "Markdown",
              ...keyboard,
            });
          } catch (editError) {
            await ctx.reply(successMessage, {
              parse_mode: "Markdown",
              ...keyboard,
            });
          }
        } else {
          await ctx.reply(successMessage, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        }
      } else {
        const errorMessage = `❌ *Purchase Failed*\n\n${purchaseResult.error}`;
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Try Again", `product_view_${productId}`)],
        ]);

        if (ctx.updateType === "callback_query") {
          await ctx.editMessageText(errorMessage, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        } else {
          await ctx.reply(errorMessage, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        }
      }
    } catch (error) {
      console.error("Product purchase error:", error);
      if (ctx.updateType === "callback_query") {
        await ctx.answerCbQuery(`❌ ${error.message.substring(0, 50)}...`);
      } else {
        await ctx.reply(`❌ Error: ${error.message}`);
      }
    }
  };

  // ========== PRODUCT IMAGE HANDLERS ==========
  handleProductImageUpload = async (ctx, session) => {
    try {
      const userId = ctx.from.id;
      const photo = ctx.message.photo[ctx.message.photo.length - 1];

      session.productData.image_file_id = photo.file_id;
      session.step = "image_uploaded";
      this.productCatalogSessions.set(userId, session);

      await ctx.reply(
        `✅ *Image Uploaded!*\n\n` +
          `Product image has been attached.\n\n` +
          `Creating product now...`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "⏭️ Skip Image",
                `product_skip_image_${userId}`,
              ),
            ],
          ]),
        },
      );

      await this.createProductFromSession(ctx, session);
      this.productCatalogSessions.delete(userId);
    } catch (error) {
      console.error("Handle product image upload error:", error);
      await ctx.reply("❌ Error uploading product image. Please try again.");
    }
  };

  handleProductImageUpdate = async (ctx, session) => {
    try {
      const userId = ctx.from.id;
      const { ProductCatalog } = require("../models");
      const photo = ctx.message.photo[ctx.message.photo.length - 1];

      await ProductCatalog.update(
        {
          image_file_id: photo.file_id,
          has_image: true,
        },
        {
          where: { id: session.productId },
        },
      );

      this.productCatalogSessions.delete(userId);

      await ctx.reply(
        `✅ *Product Image Updated!*\n\n` +
          `The product image has been successfully updated.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🔙 Back to Edit",
                `product_edit_${session.productId}`,
              ),
            ],
          ]),
        },
      );
    } catch (error) {
      console.error("Handle product image update error:", error);
      this.productCatalogSessions.delete(ctx.from.id);
      await ctx.reply("❌ Error updating product image.");
    }
  };

  createProductFromSession = async (ctx, session) => {
    try {
      const ProductCatalogService = require("./productCatalogService");

      session.productData.bot_id = session.botId;

      const result = await ProductCatalogService.createProduct(
        session.productData,
      );

      if (result.success) {
        await ctx.reply(
          `✅ *Product Created Successfully!*\n\n` +
            `*Name:* ${result.product.name}\n` +
            `*Price:* ${result.product.price} BOM ($${result.product.price}.00 USD)\n` +
            `*Type:* ${result.product.is_digital ? "Digital 📱" : "Physical 📦"}\n` +
            `*Stock:* ${result.product.stock_quantity === null ? "Unlimited" : result.product.stock_quantity}\n\n` +
            `Users can now purchase this product via /catalog command.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "🛍️ View Product",
                  `product_view_${result.product.id}`,
                ),
              ],
              [
                Markup.button.callback(
                  "📦 Manage Products",
                  `product_manage_${session.botId}`,
                ),
              ],
            ]),
          },
        );
      } else {
        await ctx.reply(`❌ *Failed to Create Product*\n\n${result.error}`, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🔄 Try Again",
                `product_add_${session.botId}`,
              ),
            ],
          ]),
        });
      }
    } catch (error) {
      console.error("Create product from session error:", error);
      await ctx.reply(
        "❌ Error creating product. Please try again.",
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🔙 Product Management",
              `product_manage_${session.botId}`,
            ),
          ],
        ]),
      );
    }
  };

  processProductCatalogInput = async (ctx, session, message) => {
    try {
      const userId = ctx.from.id;

      if (message === "/cancel") {
        this.productCatalogSessions.delete(userId);
        await ctx.reply("❌ Action cancelled.");
        return;
      }

      if (
        session.action === "custom_purchase" &&
        session.step === "awaiting_custom_quantity"
      ) {
        const quantity = parseInt(message);
        if (isNaN(quantity) || quantity <= 0) {
          await ctx.reply("❌ Please enter a valid number (e.g., 5, 10):");
          return;
        }

        await this.handleProductPurchase(ctx, session.productId, quantity);
        this.productCatalogSessions.delete(userId);
        return;
      }

      if (
        session.action === "edit_product" &&
        session.step &&
        session.step.includes("_edit")
      ) {
        await this.processProductFieldEdit(ctx, session, message);
        return;
      }

      if (session.action === "deliver_digital") {
        await this.processDigitalDelivery(ctx, session, message);
        return;
      }

      if (session.action === "update_image") {
        await this.processImageUpdate(ctx, session, message);
        return;
      }

      switch (session.step) {
        case "awaiting_name":
          session.productData.name = message;
          session.step = "awaiting_description";
          this.productCatalogSessions.set(userId, session);

          await ctx.reply(
            `📝 *Product Description*\n\n` +
              `Please enter the product description:\n\n` +
              `*Tips:*\n` +
              `• Describe what the buyer gets\n` +
              `• Include important details\n` +
              `• Markdown formatting is supported\n\n`,
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    "🚫 Cancel",
                    `product_manage_${session.botId}`,
                  ),
                ],
              ]),
            },
          );
          break;

        case "awaiting_description":
          session.productData.description = message;
          session.step = "awaiting_price";
          this.productCatalogSessions.set(userId, session);

          await ctx.reply(
            `💰 *Product Price*\n\n` +
              `Please enter the price in BOM:\n\n` +
              `*Examples:*\n` +
              `• 5 (for 5 BOM = $5.00 USD)\n` +
              `• 9.99 (for 9.99 BOM = $9.99 USD)\n\n` +
              `*Note:* 1 BOM = $1.00 USD\n`,
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    "🚫 Cancel",
                    `product_manage_${session.botId}`,
                  ),
                ],
              ]),
            },
          );
          break;

        case "awaiting_price":
          const price = parseFloat(message);
          if (isNaN(price) || price <= 0) {
            await ctx.reply("❌ Please enter a valid price (e.g., 5 or 9.99):");
            return;
          }

          session.productData.price = price;
          session.step = "awaiting_type";
          this.productCatalogSessions.set(userId, session);

          await ctx.reply(
            `📦 *Product Type*\n\n` +
              `Is this a digital or physical product?\n\n` +
              `*Digital:*\n` +
              `• Ebooks, courses, software\n` +
              `• Delivered instantly\n` +
              `• No shipping required\n\n` +
              `*Physical:*\n` +
              `• Goods that need shipping\n` +
              `• Requires delivery details\n\n` +
              `Choose an option:\n\n`,
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    "📱 Digital",
                    `product_type_digital_${userId}`,
                  ),
                  Markup.button.callback(
                    "📦 Physical",
                    `product_type_physical_${userId}`,
                  ),
                ],
                [
                  Markup.button.callback(
                    "🚫 Cancel",
                    `product_manage_${session.botId}`,
                  ),
                ],
              ]),
            },
          );
          break;

        case "awaiting_stock":
          if (message.toLowerCase() === "unlimited") {
            session.productData.stock_quantity = null;
          } else {
            const stock = parseInt(message);
            if (isNaN(stock) || stock < 0) {
              await ctx.reply('❌ Please enter a valid number or "unlimited":');
              return;
            }
            session.productData.stock_quantity = stock;
          }

          session.step = "awaiting_image_optional";
          this.productCatalogSessions.set(userId, session);

          await ctx.reply(
            `🖼️ *Product Image (Optional)*\n\n` +
              `You can now send a product image:\n\n` +
              `• Send a photo now to add it to the product\n` +
              `• Type "skip" to continue without an image\n` +
              `• Type "done" to create the product now\n\n` +
              `*Tip:* Images help sell products!`,
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    "⏭️ Skip Image",
                    `product_skip_image_${userId}`,
                  ),
                  Markup.button.callback(
                    "✅ Done",
                    `product_create_now_${userId}`,
                  ),
                ],
                [
                  Markup.button.callback(
                    "🚫 Cancel",
                    `product_manage_${session.botId}`,
                  ),
                ],
              ]),
            },
          );
          break;

        case "awaiting_image_optional":
          if (
            message.toLowerCase() === "skip" ||
            message.toLowerCase() === "done"
          ) {
            await this.createProductFromSession(ctx, session);
            this.productCatalogSessions.delete(userId);
          } else {
            await ctx.reply(
              'Please send a photo or type "skip" to continue without an image.',
            );
          }
          break;

        default:
          console.log(
            `❌ Invalid session state: step=${session.step}, action=${session.action}`,
          );
          this.productCatalogSessions.delete(userId);
          await ctx.reply("❌ Session expired or invalid. Please start over.");
      }
    } catch (error) {
      console.error("Process product catalog input error:", error);
      this.productCatalogSessions.delete(ctx.from.id);
      await ctx.reply("❌ Error processing input. Please try again.");
    }
  };

  processProductFieldEdit = async (ctx, session, message) => {
    try {
      const userId = ctx.from.id;
      const ProductCatalogService = require("./productCatalogService");

      if (message === "/cancel") {
        this.productCatalogSessions.delete(userId);
        await ctx.reply("❌ Edit cancelled.");
        return;
      }

      const field = session.step.replace("awaiting_", "").replace("_edit", "");
      let updateData = {};

      switch (field) {
        case "name":
          if (!message.trim()) {
            await ctx.reply(
              "❌ Product name cannot be empty. Please enter a valid name:",
            );
            return;
          }
          updateData.name = message;
          break;

        case "description":
          updateData.description = message;
          break;

        case "price":
          const price = parseFloat(message);
          if (isNaN(price) || price <= 0) {
            await ctx.reply("❌ Please enter a valid price (e.g., 5 or 9.99):");
            return;
          }
          updateData.price = price;
          break;

        case "stock":
          if (message.toLowerCase() === "unlimited") {
            updateData.stock_quantity = null;
          } else {
            const stock = parseInt(message);
            if (isNaN(stock) || stock < 0) {
              await ctx.reply('❌ Please enter a valid number or "unlimited":');
              return;
            }
            updateData.stock_quantity = stock;
          }
          break;

        default:
          throw new Error(`Unknown field: ${field}`);
      }

      const result = await ProductCatalogService.updateProduct(
        session.productId,
        updateData,
        userId,
      );

      this.productCatalogSessions.delete(userId);

      if (result.success) {
        await ctx.reply(
          `✅ *Product ${field} updated!*\n\n` +
            `The ${field} has been updated successfully.\n\n` +
            `*New ${field}:* ${message}`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "🔙 Back to Edit",
                  `product_edit_${session.productId}`,
                ),
              ],
            ]),
          },
        );
      } else {
        await ctx.reply(`❌ *Update Failed*\n\n${result.error}`, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🔙 Try Again",
                `product_edit_${session.productId}`,
              ),
            ],
          ]),
        });
      }
    } catch (error) {
      console.error("Process product field edit error:", error);
      this.productCatalogSessions.delete(ctx.from.id);
      await ctx.reply("❌ Error updating product. Please try again.");
    }
  };

  processDigitalDelivery = async (ctx, session, content) => {
    try {
      const userId = ctx.from.id;

      if (content === "/cancel") {
        this.productCatalogSessions.delete(userId);
        await ctx.reply("❌ Digital delivery cancelled.");
        return;
      }

      let botId = session.botId;

      if (!botId && session.orderId) {
        const { ProductOrder } = require("../models");
        const order = await ProductOrder.findByPk(session.orderId);
        if (order) {
          botId = order.bot_id;
        }
      }

      if (!botId && ctx.metaBotInfo) {
        botId = ctx.metaBotInfo.mainBotId;
      }

      if (!botId) {
        await ctx.reply("❌ Could not determine bot for delivery.");
        this.productCatalogSessions.delete(userId);
        return;
      }

      botId = parseInt(botId);

      const { Bot } = require("../models");
      const bot = await Bot.findByPk(botId);

      if (!bot) {
        await ctx.reply("❌ Bot not found.");
        this.productCatalogSessions.delete(userId);
        return;
      }

      const isOwner = parseInt(userId) === parseInt(bot.owner_id);
      if (!isOwner) {
        await ctx.reply("❌ Only bot owner can deliver digital content.");
        this.productCatalogSessions.delete(userId);
        return;
      }

      const ProductCatalogService = require("./productCatalogService");
      const result = await ProductCatalogService.deliverDigitalContent(
        session.orderId,
        content,
        userId,
      );

      this.productCatalogSessions.delete(userId);

      if (result.success) {
        const isOwnerOrAdmin =
          (await this.checkOwnerAccess(botId, userId)) ||
          (await this.checkAdminAccess(botId, userId));

        const keyboardButtons = [];
        if (isOwnerOrAdmin) {
          keyboardButtons.push([
            Markup.button.callback(
              "📋 Back to Orders",
              `orders_manage_${botId}`,
            ),
          ]);
        } else {
          keyboardButtons.push([
            Markup.button.callback(
              "📋 Back to My Orders",
              `my_orders_${userId}`,
            ),
          ]);
        }
        keyboardButtons.push([
          Markup.button.callback("🛍️ Continue Shopping", `catalog_${botId}`),
        ]);

        await ctx.reply(
          `✅ *Digital Content Delivered!*\n\n` +
            `The content has been sent to the customer.\n\n` +
            `*Order marked as delivered automatically.*`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard(keyboardButtons),
          },
        );
      } else {
        await ctx.reply(`❌ *Delivery Failed*\n\n${result.error}`, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🔄 Try Again",
                `order_deliver_${session.orderId}`,
              ),
            ],
          ]),
        });
      }
    } catch (error) {
      console.error("Process digital delivery error:", error);
      this.productCatalogSessions.delete(ctx.from.id);
      await ctx.reply("❌ Error delivering digital content: " + error.message);
    }
  };

  // ========== ORDER MANAGEMENT ==========
  handleOrderManagement = async (ctx, botId) => {
    try {
      const userId = ctx.from.id;

      const isOwner = await this.checkOwnerAccess(botId, userId);
      if (!isOwner) {
        if (ctx.updateType === "callback_query") {
          await ctx.answerCbQuery("❌ Only bot owner can manage orders");
        }
        return;
      }

      const ProductCatalogService = require("./productCatalogService");
      const ordersResult = await ProductCatalogService.getOrders(
        botId,
        null,
        10,
        0,
      );

      if (!ordersResult.success) {
        if (ctx.updateType === "callback_query") {
          await ctx.answerCbQuery("❌ Error loading orders");
        }
        return;
      }

      const orders = ordersResult.orders || [];
      const bot = await require("../models").Bot.findByPk(botId);

      let message =
        `📋 *Order Management - ${bot.bot_name}*\n\n` +
        `*Total Orders:* ${ordersResult.pagination.total}\n\n`;

      if (orders.length === 0) {
        message += `No orders yet. Promote your products!`;
      } else {
        orders.forEach((order, index) => {
          const customerName = order.Customer
            ? `${order.Customer.first_name}${order.Customer.username ? ` (@${order.Customer.username})` : ""}`
            : `User#${order.customer_user_id}`;

          const statusEmoji =
            {
              pending: "⏳",
              paid: "💰",
              processing: "🔧",
              shipped: "🚚",
              delivered: "✅",
              cancelled: "❌",
              refunded: "↩️",
            }[order.status] || "📝";

          message +=
            `*${index + 1}. ${statusEmoji} Order #${order.order_number}*\n` +
            `👤 ${customerName}\n` +
            `🛍️ ${order.Product?.name || "Product"}\n` +
            `💰 ${order.total_amount} ${order.currency}\n` +
            `📅 ${new Date(order.created_at).toLocaleDateString()}\n\n`;
        });
      }

      const keyboardButtons = [];

      if (orders.length > 0) {
        orders.slice(0, 5).forEach((order) => {
          keyboardButtons.push([
            Markup.button.callback(
              `👁️ View #${order.order_number.substring(0, 8)}...`,
              `order_view_${order.id}`,
            ),
          ]);
        });
      }

      keyboardButtons.push([
        Markup.button.callback("⏳ Pending", `orders_filter_${botId}_pending`),
        Markup.button.callback("💰 Paid", `orders_filter_${botId}_paid`),
        Markup.button.callback(
          "✅ Delivered",
          `orders_filter_${botId}_delivered`,
        ),
      ]);

      keyboardButtons.push([
        Markup.button.callback("📊 Statistics", `catalog_stats_${botId}`),
        Markup.button.callback("🔙 Back to Catalog", `catalog_${botId}`),
        Markup.button.callback("📊 Dashboard", "mini_dashboard"),
      ]);

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      if (ctx.updateType === "callback_query") {
        try {
          await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        } catch (error) {
          if (
            error.message &&
            error.message.includes("message is not modified")
          ) {
            console.log(`⚠️ Order management not modified`);
            await ctx.answerCbQuery();
          } else {
            throw error;
          }
        }
      } else {
        await ctx.replyWithMarkdown(message, keyboard);
      }

      if (ctx.updateType === "callback_query") {
        await ctx.answerCbQuery();
      }
    } catch (error) {
      console.error("Order management error:", error);
      if (ctx.updateType === "callback_query") {
        await ctx.answerCbQuery("❌ Error loading orders");
      }
    }
  };

  handleOrderFilter = async (ctx, botId, status) => {
    try {
      const userId = ctx.from.id;

      const isOwner = await this.checkOwnerAccess(botId, userId);
      if (!isOwner) {
        await ctx.answerCbQuery("❌ Only bot owner can filter orders");
        return;
      }

      const ProductCatalogService = require("./productCatalogService");
      const ordersResult = await ProductCatalogService.getOrders(
        botId,
        status,
        10,
        0,
      );

      if (!ordersResult.success) {
        await ctx.answerCbQuery("❌ Error loading orders");
        return;
      }

      const orders = ordersResult.orders || [];
      const bot = await require("../models").Bot.findByPk(botId);

      let message =
        `📋 *Order Management - ${bot.bot_name}*\n\n` +
        `*Filter:* ${status.charAt(0).toUpperCase() + status.slice(1)}\n` +
        `*Total Orders:* ${orders.length}\n\n`;

      if (orders.length === 0) {
        message += `No ${status} orders found.`;
      } else {
        orders.forEach((order, index) => {
          const customerName = order.Customer
            ? `${order.Customer.first_name}${order.Customer.username ? ` (@${order.Customer.username})` : ""}`
            : `User#${order.customer_user_id}`;

          const statusEmoji =
            {
              pending: "⏳",
              paid: "💰",
              processing: "🔧",
              shipped: "🚚",
              delivered: "✅",
              cancelled: "❌",
              refunded: "↩️",
            }[order.status] || "📝";

          message +=
            `*${index + 1}. ${statusEmoji} Order #${order.order_number}*\n` +
            `👤 ${customerName}\n` +
            `🛍️ ${order.Product?.name || "Product"}\n` +
            `💰 ${order.total_amount} ${order.currency}\n` +
            `📅 ${new Date(order.created_at).toLocaleDateString()}\n\n`;
        });
      }

      const keyboardButtons = [];

      if (orders.length > 0) {
        orders.slice(0, 5).forEach((order) => {
          keyboardButtons.push([
            Markup.button.callback(
              `👁️ View #${order.order_number.substring(0, 8)}...`,
              `order_view_${order.id}`,
            ),
          ]);
        });
      }

      const allStatuses = [
        "pending",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ];
      const statusButtons = [];

      allStatuses.forEach((statusType) => {
        if (
          statusButtons.length === 0 ||
          statusButtons[statusButtons.length - 1].length === 3
        ) {
          statusButtons.push([]);
        }
        const buttonText =
          statusType.charAt(0).toUpperCase() + statusType.slice(1);
        const isActive = statusType === status;
        statusButtons[statusButtons.length - 1].push(
          Markup.button.callback(
            isActive ? `✅ ${buttonText}` : buttonText,
            `orders_filter_${botId}_${statusType}`,
          ),
        );
      });

      statusButtons.forEach((row) => {
        keyboardButtons.push(row);
      });

      keyboardButtons.push([
        Markup.button.callback("📊 Statistics", `catalog_stats_${botId}`),
        Markup.button.callback("🔙 Back to Orders", `orders_manage_${botId}`),
        Markup.button.callback("📊 Dashboard", "mini_dashboard"),
      ]);

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      if (ctx.updateType === "callback_query") {
        try {
          await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        } catch (error) {
          if (
            error.message &&
            error.message.includes("message is not modified")
          ) {
            await ctx.answerCbQuery();
          } else {
            throw error;
          }
        }
      }

      if (ctx.updateType === "callback_query") {
        await ctx.answerCbQuery();
      }
    } catch (error) {
      console.error("Handle order filter error:", error);
      await ctx.answerCbQuery("❌ Error filtering orders");
    }
  };

  handleOrderView = async (ctx, orderId) => {
    try {
      const ProductOrder = require("../models").ProductOrder;
      const ProductCatalog = require("../models").ProductCatalog;
      const User = require("../models").User;
      const Bot = require("../models").Bot;

      const order = await ProductOrder.findByPk(orderId, {
        include: [
          {
            model: ProductCatalog,
            as: "Product",
          },
          {
            model: User,
            as: "Customer",
          },
          {
            model: Bot,
            as: "OrderBot",
          },
        ],
      });

      if (!order) {
        await ctx.answerCbQuery("❌ Order not found");
        return;
      }

      const customerName = order.Customer
        ? `${order.Customer.first_name}${order.Customer.username ? ` (@${order.Customer.username})` : ""}`
        : `User#${order.customer_user_id}`;

      const statusEmoji =
        {
          pending: "⏳",
          paid: "💰",
          processing: "🔧",
          shipped: "🚚",
          delivered: "✅",
          cancelled: "❌",
          refunded: "↩️",
        }[order.status] || "📝";

      const statusText =
        {
          pending: "Pending",
          paid: "Paid",
          processing: "Processing",
          shipped: "Shipped",
          delivered: "Delivered",
          cancelled: "Cancelled",
          refunded: "Refunded",
        }[order.status] || order.status;

      let message =
        `📋 *Order #${order.order_number}*\n\n` +
        `*Product:* ${order.Product?.name || "Unknown"}\n` +
        `*Customer:* ${customerName}\n` +
        `*Quantity:* ${order.quantity}\n` +
        `*Unit Price:* ${order.unit_price} ${order.currency}\n` +
        `*Total:* ${order.total_amount} ${order.currency} ($${order.total_amount}.00 USD)\n` +
        `*Status:* ${statusEmoji} ${statusText}\n` +
        `*Order Date:* ${new Date(order.created_at).toLocaleString()}\n` +
        `*Type:* ${order.Product?.is_digital ? "Digital 📱" : "Physical 📦"}\n`;

      if (order.delivery_details) {
        try {
          const details =
            typeof order.delivery_details === "string"
              ? JSON.parse(order.delivery_details)
              : order.delivery_details;

          if (details && Object.keys(details).length > 0) {
            message += `\n*Delivery Details:*\n`;
            Object.entries(details).forEach(([key, value]) => {
              if (value) {
                const formattedKey = key
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase());
                message += `• ${formattedKey}: ${value}\n`;
              }
            });
          }
        } catch (e) {
          console.error("Error parsing delivery details:", e);
        }
      }

      if (order.notes) {
        message += `\n*Notes:*\n${order.notes}\n`;
      }

      const keyboardButtons = [];
      const userId = ctx.from.id;

      if (order.OrderBot && order.OrderBot.owner_id == userId) {
        switch (order.status) {
          case "pending":
            keyboardButtons.push([
              Markup.button.callback(
                "💰 Mark as Paid",
                `order_update_${order.id}_paid`,
              ),
            ]);
            break;

          case "paid":
            if (order.Product?.is_digital) {
              keyboardButtons.push([
                Markup.button.callback(
                  "📱 Deliver Digital Content",
                  `order_deliver_${order.id}`,
                ),
              ]);
              keyboardButtons.push([
                Markup.button.callback(
                  "🔧 Mark as Processing",
                  `order_update_${order.id}_processing`,
                ),
              ]);
            } else {
              keyboardButtons.push([
                Markup.button.callback(
                  "🔧 Mark as Processing",
                  `order_update_${order.id}_processing`,
                ),
              ]);
            }
            break;

          case "processing":
            if (order.Product?.is_digital) {
              keyboardButtons.push([
                Markup.button.callback(
                  "📱 Deliver Digital Content",
                  `order_deliver_${order.id}`,
                ),
              ]);
            } else {
              keyboardButtons.push([
                Markup.button.callback(
                  "🚚 Mark as Shipped",
                  `order_update_${order.id}_shipped`,
                ),
              ]);
            }
            break;

          case "shipped":
            keyboardButtons.push([
              Markup.button.callback(
                "✅ Mark as Delivered",
                `order_update_${order.id}_delivered`,
              ),
            ]);
            break;
        }

        if (["pending", "paid", "processing"].includes(order.status)) {
          keyboardButtons.push([
            Markup.button.callback(
              "❌ Cancel Order",
              `order_update_${order.id}_cancelled`,
            ),
            Markup.button.callback(
              "↩️ Refund Order",
              `order_update_${order.id}_refunded`,
            ),
          ]);
        }

        if (order.status === "shipped") {
          keyboardButtons.push([
            Markup.button.callback(
              "↩️ Refund Order",
              `order_update_${order.id}_refunded`,
            ),
          ]);
        }
      }

      const isOwnerOrAdmin =
        order.OrderBot &&
        (order.OrderBot.owner_id == userId ||
          (await this.checkAdminAccess(order.bot_id, userId)));

      if (isOwnerOrAdmin) {
        keyboardButtons.push([
          Markup.button.callback(
            "🔙 Back to Orders",
            `orders_manage_${order.bot_id}`,
          ),
        ]);
      } else {
        keyboardButtons.push([
          Markup.button.callback("🔙 Back to My Orders", `my_orders_${userId}`),
        ]);
      }

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      if (ctx.updateType === "callback_query") {
        await ctx.editMessageText(message, {
          parse_mode: "Markdown",
          ...keyboard,
        });
      } else {
        await ctx.replyWithMarkdown(message, keyboard);
      }

      await ctx.answerCbQuery();
    } catch (error) {
      console.error("Order view error:", error);
      await ctx.answerCbQuery("❌ Error loading order details");
    }
  };

  handleOrderStatusUpdate = async (ctx, orderId, status) => {
    try {
      const userId = ctx.from.id;
      const ProductCatalogService = require("./productCatalogService");
      const { ProductOrder, User, ProductCatalog, Bot } = require("../models");

      await ctx.answerCbQuery("🔄 Updating order status...");

      const order = await ProductOrder.findByPk(orderId, {
        include: [
          {
            model: ProductCatalog,
            as: "Product",
          },
          {
            model: User,
            as: "Customer",
          },
          {
            model: Bot,
            as: "OrderBot",
          },
        ],
      });

      if (!order) {
        await ctx.answerCbQuery("❌ Order not found");
        return;
      }

      if (order.OrderBot.owner_id != userId) {
        await ctx.answerCbQuery("❌ Only bot owner can update orders");
        return;
      }

      const result = await ProductCatalogService.updateOrderStatus(
        orderId,
        status,
        userId,
      );

      if (result.success) {
        await this.notifyCustomerOrderStatusUpdate(order, status);

        let message =
          `✅ *Order Status Updated*\n\n` +
          `Order #${order.order_number} has been marked as ${status}.\n\n`;

        const isOwnerOrAdmin =
          order.OrderBot.owner_id == userId ||
          (await this.checkAdminAccess(order.bot_id, userId));

        const keyboardButtons = [
          [Markup.button.callback("📋 Back to Order", `order_view_${orderId}`)],
        ];

        if (isOwnerOrAdmin) {
          keyboardButtons.push([
            Markup.button.callback(
              "📦 Back to Orders",
              `orders_manage_${order.bot_id}`,
            ),
          ]);
        } else {
          keyboardButtons.push([
            Markup.button.callback(
              "📦 Back to My Orders",
              `my_orders_${userId}`,
            ),
          ]);
        }

        const keyboard = Markup.inlineKeyboard(keyboardButtons);

        if (ctx.updateType === "callback_query") {
          await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        } else {
          await ctx.replyWithMarkdown(message, keyboard);
        }
      } else {
        await ctx.answerCbQuery(`❌ ${result.error}`);
      }
    } catch (error) {
      console.error("Order status update error:", error);
      await ctx.answerCbQuery("❌ Error updating order status");
    }
  };

  notifyCustomerOrderStatusUpdate = async (order, newStatus) => {
    try {
      const botInstance = this.getBotInstanceByDbId(order.bot_id);

      if (!botInstance) {
        console.error(`❌ Bot instance not found for bot ID: ${order.bot_id}`);
        return false;
      }

      const statusInfo = {
        pending: { emoji: "⏳", text: "Pending" },
        paid: { emoji: "💰", text: "Paid" },
        processing: { emoji: "🔧", text: "Processing" },
        shipped: { emoji: "🚚", text: "Shipped" },
        delivered: { emoji: "✅", text: "Delivered" },
        cancelled: { emoji: "❌", text: "Cancelled" },
        refunded: { emoji: "↩️", text: "Refunded" },
      };

      const statusData = statusInfo[newStatus] || {
        emoji: "📝",
        text: newStatus,
      };

      let message = `${statusData.emoji} *Order Status Update*\n\n`;
      message += `*Order #:* ${order.order_number}\n`;
      message += `*Product:* ${order.Product?.name || "Product"}\n`;
      message += `*Quantity:* ${order.quantity}\n`;
      message += `*Total:* ${order.total_amount} ${order.currency} ($${order.total_amount}.00)\n\n`;
      message += `*Status:* ${statusData.text}\n\n`;

      switch (newStatus) {
        case "paid":
          message += `✅ Payment confirmed!\nYour order is now being processed.\n\n`;
          if (order.Product?.is_digital) {
            message += `• Digital content will be delivered shortly\n`;
          } else {
            message += `• Seller will prepare your items\n`;
            message += `• You'll be notified when it ships\n`;
          }
          break;

        case "processing":
          message += `🔧 Your order is now being processed.\n\n`;
          if (order.Product?.is_digital) {
            message += `• Digital content is being prepared\n`;
            message += `• Will be delivered shortly\n`;
          } else {
            message += `• Items are being prepared for shipping\n`;
            message += `• Estimated: 1-2 business days\n`;
          }
          break;

        case "shipped":
          message += `🚚 Your order has been shipped!\n\n`;
          if (order.delivery_details) {
            if (order.delivery_details.tracking_number) {
              message += `• Tracking #: ${order.delivery_details.tracking_number}\n`;
            }
            if (order.delivery_details.carrier) {
              message += `• Carrier: ${order.delivery_details.carrier}\n`;
            }
            if (order.delivery_details.estimated_delivery) {
              message += `• Est. Delivery: ${order.delivery_details.estimated_delivery}\n`;
            }
          }
          break;

        case "delivered":
          message += `🎉 Your order has been delivered!\n\n`;
          if (order.Product?.is_digital) {
            message += `Your digital content is now available.\n`;
            if (order.digital_content_delivered) {
              message += `Check your previous messages for the content.\n`;
            }
          } else {
            message += `Your items have been delivered to the specified address.\n`;
          }
          message += `\nThank you for your purchase! 🤝\n`;
          break;

        case "cancelled":
          message += `❌ Your order has been cancelled.\n\n`;
          if (order.notes) {
            message += `*Reason:* ${order.notes}\n\n`;
          }
          if (order.status === "paid") {
            message += `• Refund will be processed automatically\n`;
            message += `• Funds will return to your BOM wallet\n`;
          }
          break;

        case "refunded":
          message += `↩️ Your order has been refunded.\n\n`;
          message += `*Amount:* ${order.total_amount} ${order.currency}\n`;
          message += `*Method:* BOM Wallet\n`;
          message += `*Status:* Completed\n\n`;
          message += `The refund has been processed to your BOM wallet.\n`;
          break;
      }

      const botRef = this.getBotReference();
      message += `\n\n_For support, contact @${botRef.supportBot}_`;

      try {
        await botInstance.telegram.sendMessage(
          order.customer_user_id,
          message,
          { parse_mode: "Markdown" },
        );
        return true;
      } catch (error) {
        console.error(`Failed to notify customer:`, error.message);
        return false;
      }
    } catch (error) {
      console.error("Notify customer error:", error);
      return false;
    }
  };

  startDigitalDelivery = async (ctx, orderId) => {
    try {
      const userId = ctx.from.id;

      this.productCatalogSessions.set(userId, {
        orderId: orderId,
        step: "awaiting_digital_content",
        action: "deliver_digital",
      });

      await ctx.editMessageText(
        `📱 *Deliver Digital Content*\n\n` +
          `Please enter the digital content to deliver:\n\n` +
          `*Examples:*\n` +
          `• Download link\n` +
          `• Access code\n` +
          `• Instructions\n` +
          `• File content (if short)\n\n` +
          `*Note:* This will be sent directly to the customer.\n` +
          `*Cancel:* Type /cancel`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🚫 Cancel", `order_view_${orderId}`)],
          ]),
        },
      );

      await ctx.answerCbQuery();
    } catch (error) {
      console.error("Start digital delivery error:", error);
      await ctx.answerCbQuery("❌ Error starting digital delivery");
    }
  };

  // ========== CLEANUP ==========
  async cleanup() {
    console.log("🧹 Running MiniBotManager cleanup...");
    this.buttonResponseCache.clear();
    this.userSessionCache.clear();
    await BotCleanupService.runFullCleanup();
  }

  // ========== STATIC METHODS ==========
  async initializeBot(botRecord) {
    return this.setupWebhookForBot(botRecord, 0, 1);
  }

  async initializeBotWithEncryptionCheck(botRecord) {
    try {
      const decryptionTest = await botRecord.testTokenDecryption();
      if (!decryptionTest.success) {
        console.error(
          `❌ Token decryption failed for ${botRecord.bot_name}: ${decryptionTest.message}`,
        );
        return false;
      }
      return await this.setupWebhookForBot(botRecord, 0, 1);
    } catch (error) {
      console.error(
        `💥 Encryption check failed for ${botRecord.bot_name}:`,
        error.message,
      );
      return false;
    }
  }

  // ========== EXPORT ==========
}

module.exports = new MiniBotManager();
