// src/app.js - RENDER DEPLOYMENT WITH WEBHOOKS & NEW FEATURES
// ALWAYS load dotenv first
try {
  require("dotenv").config();
} catch (e) {
  console.log("📝 No .env file found, using environment variables only");
}

console.log("🔍 DEBUGGING STARTUP ON RENDER");
console.log("================================");

console.log("📋 Initial Environment check:");
console.log("   NODE_ENV:", process.env.NODE_ENV || "not set");
console.log("   PORT:", process.env.PORT || "not set");
console.log("   HOST:", process.env.HOST || "not set");
console.log(
  "   RENDER_EXTERNAL_URL:",
  process.env.RENDER_EXTERNAL_URL ? "SET" : "not set",
);
console.log("   DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");
console.log("   BOT_TOKEN:", process.env.BOT_TOKEN ? "SET" : "NOT SET");

// Now load dependencies
const { Telegraf, Markup } = require("telegraf");
const express = require("express");
const path = require("path");
const cors = require("cors");

// Create config AFTER environment check
const createConfig = require("../config/environment");
const config = createConfig();

console.log("🚀 Starting main app...");
console.log("🚀 Production mode - Using Render environment variables");
console.log("🔧 Loading environment configuration...");
console.log("   Environment:", config.NODE_ENV);
console.log("   Platform:", config.IS_RENDER ? "Render 🚀" : "Local");
console.log("   Port:", config.PORT);
console.log("✅ Running on Render deployment");
const { connectDB } = require("../database/db");
const MiniBotManager = require("./services/MiniBotManager");

// Import handlers
const {
  startHandler,
  helpHandler,
  featuresHandler,
  defaultHandler,
} = require("./handlers/startHandler");
const {
  createBotHandler,
  handleTokenInput,
  handleNameInput,
  cancelCreationHandler,
  isInCreationSession,
  getCreationStep,
} = require("./handlers/createBotHandler");
const { myBotsHandler } = require("./handlers/myBotsHandler");
const PlatformAdminHandler = require("./handlers/platformAdminHandler");
const WalletHandler = require("./handlers/walletHandler");

// Import routes
const walletRoutes = require("./routes/walletRoutes");

// Import cron jobs
const SubscriptionCron = require("./services/subscriptionCron");

// Import new services
const SessionManager = require("./utils/sessionManager");
const MenuHandler = require("./handlers/menuHandler");

// ==================== DYNAMIC URL HANDLING FOR RENDER ====================
const getRenderPublicUrl = () => {
  const cleanUrl = (url) => {
    if (!url) return url;
    let cleanUrl = url.toString().trim();
    cleanUrl = cleanUrl.replace(/^https?:\/\//i, "");
    cleanUrl = cleanUrl.replace(/\/$/, "");
    return `https://${cleanUrl}`;
  };

  if (process.env.NGROK_URL) {
    const url = cleanUrl(process.env.NGROK_URL);
    console.log(`🔧 Development: Using NGROK_URL: ${url}`);
    return url;
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    const url = cleanUrl(process.env.RENDER_EXTERNAL_URL);
    console.log(`🚀 Production: Using RENDER_EXTERNAL_URL: ${url}`);
    return url;
  }

  if (process.env.RENDER_URL) {
    const url = cleanUrl(process.env.RENDER_URL);
    console.log(`🚀 Production: Using RENDER_URL: ${url}`);
    return url;
  }

  if (process.env.PUBLIC_URL) {
    const url = cleanUrl(process.env.PUBLIC_URL);
    console.log(`🚀 Production: Using PUBLIC_URL: ${url}`);
    return url;
  }

  const isLocalDevelopment =
    !process.env.RENDER_EXTERNAL_URL &&
    (process.env.NODE_ENV === "development" || !process.env.NODE_ENV);

  if (isLocalDevelopment) {
    console.log("🔧 Development: Local mode detected");
    return "http://localhost:3000";
  }

  const fallbackUrl = "https://botomics.onrender.com";
  console.log(`⚠️  No URL detected, using custom domain: ${fallbackUrl}`);
  return fallbackUrl;
};

const PUBLIC_URL = getRenderPublicUrl();
console.log(`🌐 Public URL detected: ${PUBLIC_URL}`);

class MetaBotCreator {
  constructor() {
    console.log("\n🔍 Inside MetaBotCreator constructor...");
    console.log("BOT_TOKEN available:", !!process.env.BOT_TOKEN);
    console.log("DATABASE_URL available:", !!process.env.DATABASE_URL);
    console.log("ENCRYPTION_KEY available:", !!process.env.ENCRYPTION_KEY);

    const requiredVars = ["BOT_TOKEN", "DATABASE_URL", "ENCRYPTION_KEY"];
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      console.error(
        "\n❌ Missing required environment variables:",
        missingVars,
      );
      console.error(
        "\n⚠️  Render might still be loading variables. Continuing anyway...",
      );
    } else {
      console.log("✅ All required environment variables found!");
    }

    if (!process.env.BOT_TOKEN) {
      console.error("❌ BOT_TOKEN is not set in process.env");
    }

    console.log(`🤖 Creating bot instance...`);
    console.log(`🚀 Optimized for Render deployment with WEBHOOKS`);

    const createConfig = require("../config/environment");
    const config = createConfig();

    try {
      this.bot = new Telegraf(config.BOT_TOKEN || process.env.BOT_TOKEN, {
        handlerTimeout: 90000,
        telegram: {
          apiRoot: "https://api.telegram.org",
          agent: null,
        },
      });
    } catch (error) {
      console.error("❌ Failed to create Telegraf bot:", error.message);
    }

    this.expressApp = express();
    this.setupExpress();
    this.setupHandlers();
  }

  setupExpress() {
    console.log("🔄 Setting up Express server for Render with WEBHOOKS...");

    const isRender = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_URL;

    console.log(`🚀 Running on Render: ${isRender ? "Yes" : "No"}`);
    console.log(`🌐 PUBLIC_URL: ${PUBLIC_URL}`);
    console.log(`📁 Current directory: ${process.cwd()}`);
    console.log(`🔗 Webhook endpoint: ${PUBLIC_URL}/webhook/:botId`);

    // ========== HEALTH CHECK ==========
    this.expressApp.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        service: "botomics-platform",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "production",
        mode: "webhooks",
        services: {
          session: SessionManager.getStats
            ? SessionManager.getStats()
            : "starting",
        },
      });
    });

    // Middleware
    this.expressApp.use(
      cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "ngrok-skip-browser-warning",
        ],
      }),
    );

    this.expressApp.use(express.json({ limit: "50mb" }));
    this.expressApp.use(express.urlencoded({ extended: true }));

    this.expressApp.get("/favicon.ico", (req, res) => {
      res.status(204).end();
    });

    this.expressApp.use((req, res, next) => {
      res.setHeader("ngrok-skip-browser-warning", "true");
      next();
    });

    // ========== WEBHOOK ENDPOINT ==========
    this.expressApp.post("/webhook/:botId", async (req, res) => {
      try {
        const botId = req.params.botId;
        await MiniBotManager.handleWebhook(req, res, botId);
      } catch (error) {
        console.error(`❌ Webhook error:`, error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // Webhook status endpoint
    this.expressApp.get("/webhook/status/:botId", async (req, res) => {
      try {
        const botId = req.params.botId;
        const status = await MiniBotManager.checkWebhookStatus(botId);
        res.json(status);
      } catch (error) {
        console.error(`❌ Webhook status error:`, error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // ========== API ENDPOINTS ==========
    this.expressApp.get("/api/health", (req, res) => {
      res.json({
        status: "healthy",
        service: "botomics-platform",
        version: "2.0.0",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        platform: isRender ? "render" : "local",
        publicUrl: PUBLIC_URL,
        walletUrl: `${PUBLIC_URL}/wallet`,
        mode: "webhooks",
        activeBots: MiniBotManager.activeBots.size,
        sessions: SessionManager.getStats ? SessionManager.getStats() : 0,
      });
    });

    this.expressApp.get("/api/public-url", (req, res) => {
      res.json({
        publicUrl: PUBLIC_URL,
        walletUrl: `${PUBLIC_URL}/wallet`,
        apiUrl: `${PUBLIC_URL}/api`,
        environment: process.env.NODE_ENV || "development",
        platform: isRender ? "render" : "local",
        mode: "webhooks",
      });
    });

    // ========== SESSION MANAGEMENT ENDPOINT ==========
    this.expressApp.get("/api/sessions", async (req, res) => {
      try {
        const stats = SessionManager.getStats();
        res.json({
          total: stats.total,
          active: stats.active,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Wallet API routes
    this.expressApp.use("/api", walletRoutes);
    console.log("✅ Wallet API routes registered at /api");

    // ========== WALLET STATIC FILE SERVING ==========
    console.log("\n🔍 Looking for wallet directory...");

    const fs = require("fs");
    let walletPath;

    const possiblePaths = [
      path.join(process.cwd(), "wallet"),
      path.join(__dirname, "../../wallet"),
      path.join(process.cwd(), "../wallet"),
      path.join(__dirname, "../wallet"),
    ];

    for (const possiblePath of possiblePaths) {
      console.log(`   Checking: ${possiblePath}`);
      if (fs.existsSync(possiblePath)) {
        walletPath = possiblePath;
        console.log(`   ✅ Found wallet at: ${walletPath}`);
        break;
      }
    }

    if (!walletPath) {
      console.log("❌ Wallet directory not found!");
      walletPath = path.join(process.cwd(), "wallet");
      fs.mkdirSync(walletPath, { recursive: true });
    }

    console.log(`📤 Serving static files from: ${walletPath}`);

    this.expressApp.use(
      "/wallet",
      express.static(walletPath, {
        setHeaders: (res, filePath) => {
          res.set("Access-Control-Allow-Origin", "*");
          res.set("ngrok-skip-browser-warning", "true");

          if (filePath.endsWith(".js")) {
            res.set("Content-Type", "application/javascript");
          } else if (filePath.endsWith(".css")) {
            res.set("Content-Type", "text/css");
          } else if (filePath.endsWith(".html")) {
            res.set("Content-Type", "text/html");
          }

          if (isRender) {
            res.set("Cache-Control", "public, max-age=3600");
          }
        },
      }),
    );

    this.expressApp.get("/wallet", (req, res) => {
      console.log(
        `📥 GET /wallet from ${req.headers["user-agent"]?.substring(0, 50) || "unknown"}`,
      );

      const indexPath = path.join(walletPath, "index.html");

      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send(`
          <!DOCTYPE html>
          <html>
          <head>
              <title>Botomics Wallet</title>
              <style>body { font-family: Arial; padding: 40px; text-align: center; }</style>
          </head>
          <body>
              <h1>💰 Botomics Wallet</h1>
              <p>Open from @BotomicsBot using /wallet command</p>
              <p><strong>Current URL:</strong> ${PUBLIC_URL}/wallet</p>
          </body>
          </html>
        `);
      }
    });

    // Root route
    this.expressApp.get("/", (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Botomics Platform</title>
          <style>
            body { font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto; }
            .status { color: green; font-weight: bold; }
            .link-btn { display: inline-block; margin: 10px; padding: 12px 24px; background: #0088cc; color: white; text-decoration: none; border-radius: 8px; }
            .info-box { background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>🤖 Botomics Platform</h1>
          <p class="status">✅ Online & Running on Render (Webhooks)</p>
          
          <div class="info-box">
            <h3>Quick Links</h3>
            <a href="/wallet" class="link-btn">💰 Open Wallet</a>
            <a href="/health" class="link-btn">📊 Health Check</a>
            <a href="/api/health" class="link-btn">📊 API Health</a>
            <a href="/api/public-url" class="link-btn">🌐 URL Info</a>
          </div>
          
          <div class="info-box">
            <h3>Platform Info</h3>
            <p><strong>Environment:</strong> ${process.env.NODE_ENV || "development"}</p>
            <p><strong>Public URL:</strong> ${PUBLIC_URL}</p>
            <p><strong>Wallet URL:</strong> ${PUBLIC_URL}/wallet</p>
            <p><strong>Platform:</strong> ${isRender ? "Render 🚀" : "Local 🖥️"}</p>
            <p><strong>Mode:</strong> Webhooks</p>
            <p><strong>Server Time:</strong> ${new Date().toISOString()}</p>
          </div>
        </body>
        </html>
      `);
    });

    // 404 handler
    this.expressApp.use((req, res) => {
      console.log(`❌ 404 Not Found: ${req.method} ${req.url}`);
      res.status(404).json({
        error: "Not Found",
        message: `Route ${req.method} ${req.url} not found`,
        timestamp: new Date().toISOString(),
        publicUrl: PUBLIC_URL,
      });
    });

    console.log("✅ Express server setup complete for Render (Webhooks)");
    console.log(`🌐 Wallet will be served at: ${PUBLIC_URL}/wallet`);
    console.log(`🔗 Webhook endpoint: ${PUBLIC_URL}/webhook/:botId`);
  }

  setupHandlers() {
    console.log("🔄 Setting up bot handlers...");
    this.setupMiniApp();

    // Global middleware
    this.bot.use(async (ctx, next) => {
      ctx.isMainBot = true;
      ctx.miniBotManager = MiniBotManager;

      // Initialize session if not exists
      if (ctx.from) {
        const session = SessionManager.getSession(ctx.from.id);
        if (!session) {
          SessionManager.setSession(ctx.from.id, {
            menu: "main",
            action: "start",
            context: {},
          });
        }
      }

      if (PlatformAdminHandler.isPlatformCreator(ctx.from?.id)) {
        return next();
      }

      if (ctx.from && (await PlatformAdminHandler.checkUserBan(ctx.from.id))) {
        await ctx.reply(
          "🚫 Your account has been banned from using this platform.",
        );
        return;
      }

      return next();
    });

    // ========== COMMAND HANDLERS ==========
    this.bot.start(startHandler);
    this.bot.help(helpHandler);
    this.bot.command("privacy", this.privacyHandler);
    this.bot.command("terms", this.termsHandler);

    // Wallet commands
    this.bot.command("wallet", async (ctx) => {
      await this.openWalletMiniApp(ctx);
    });

    this.bot.command("balance", async (ctx) => {
      await WalletHandler.handleWalletCommand(ctx);
    });

    this.bot.command("premium", async (ctx) => {
      await this.openWalletMiniApp(ctx, "premium");
    });

    this.bot.command("subscription", async (ctx) => {
      await this.openWalletMiniApp(ctx, "premium");
    });

    // Bot management commands
    this.bot.command("createbot", createBotHandler);
    this.bot.command("mybots", myBotsHandler);
    this.bot.command("cancel", cancelCreationHandler);

    // Platform admin commands
    this.bot.command("platform", async (ctx) => {
      if (PlatformAdminHandler.isPlatformCreator(ctx.from.id)) {
        await PlatformAdminHandler.platformDashboard(ctx);
      } else {
        ctx.reply("❌ Platform admin access required.");
      }
    });

    // Admin wallet commands
    this.bot.command("admin_wallet", async (ctx) => {
      if (PlatformAdminHandler.isPlatformCreator(ctx.from.id)) {
        await PlatformAdminHandler.walletAdminDashboard(ctx);
      } else {
        ctx.reply("❌ Admin access required.");
      }
    });

    this.bot.command("add_bom", async (ctx) => {
      if (PlatformAdminHandler.isPlatformCreator(ctx.from.id)) {
        await PlatformAdminHandler.startAddBOM(ctx);
      } else {
        ctx.reply("❌ Admin access required.");
      }
    });

    this.bot.command("freeze_wallet", async (ctx) => {
      if (PlatformAdminHandler.isPlatformCreator(ctx.from.id)) {
        await PlatformAdminHandler.startFreezeWallet(ctx);
      } else {
        ctx.reply("❌ Admin access required.");
      }
    });

    this.bot.command("unfreeze_wallet", async (ctx) => {
      if (PlatformAdminHandler.isPlatformCreator(ctx.from.id)) {
        await PlatformAdminHandler.startUnfreezeWallet(ctx);
      } else {
        ctx.reply("❌ Admin access required.");
      }
    });

    this.bot.command("grant_premium", async (ctx) => {
      if (PlatformAdminHandler.isPlatformCreator(ctx.from.id)) {
        await PlatformAdminHandler.startGrantPremium(ctx);
      } else {
        ctx.reply("❌ Admin access required.");
      }
    });

    this.bot.command("subscription_admin", async (ctx) => {
      if (PlatformAdminHandler.isPlatformCreator(ctx.from.id)) {
        await PlatformAdminHandler.subscriptionAdminDashboard(ctx);
      } else {
        ctx.reply("❌ Admin access required.");
      }
    });

    // Quick admin commands with arguments
    this.bot.command("addbom", async (ctx) => {
      if (!PlatformAdminHandler.isPlatformCreator(ctx.from.id)) {
        await ctx.reply("❌ Admin access required.");
        return;
      }

      const args = ctx.message.text.split(" ");
      if (args.length < 3) {
        await ctx.reply("Usage: /addbom <user_id> <amount>");
        await PlatformAdminHandler.startAddBOM(ctx);
        return;
      }

      try {
        const userIdentifier = args[1];
        const amount = parseFloat(args[2]);

        if (!amount || amount <= 0 || isNaN(amount)) {
          await ctx.reply("❌ Invalid amount. Please enter a positive number.");
          return;
        }

        let userId;
        if (isNaN(userIdentifier)) {
          const username = userIdentifier.replace("@", "").trim();
          const user = await require("./models").User.findOne({
            where: { username: username },
          });
          if (!user) {
            await ctx.reply(
              "❌ User not found. Please check the ID or username.",
            );
            return;
          }
          userId = user.telegram_id;
        } else {
          userId = parseInt(userIdentifier);
        }

        const WalletService = require("./services/walletService");
        const result = await WalletService.adminAdjustBalance(
          userId,
          amount,
          "Quick admin BOM addition",
          ctx.from.id,
        );

        await ctx.reply(
          `✅ *BOM Added Successfully!*\n\n` +
            `*User ID:* ${userId}\n` +
            `*Amount Added:* ${amount.toFixed(2)} BOM\n` +
            `*New Balance:* ${result.newBalance.toFixed(2)} BOM\n` +
            `*Transaction ID:* ${result.transaction.id}`,
          { parse_mode: "Markdown" },
        );
      } catch (error) {
        console.error("Quick add BOM error:", error);
        await ctx.reply(`❌ Error: ${error.message}`);
      }
    });

    // Debug and maintenance commands
    this.bot.command("debug_minibots", async (ctx) => {
      try {
        await ctx.reply("🔄 Debugging mini-bots...");
        const status = MiniBotManager.getInitializationStatus();
        let message = `🔍 *Mini-bot Debug Info*\n\n`;
        message += `*Status:* ${status.status}\n`;
        message += `*Initialized:* ${status.isInitialized ? "Yes" : "No"}\n`;
        message += `*Active Bots:* ${status.activeBots}\n`;
        message += `*Mode:* ${status.mode || "webhooks"}\n`;

        const { Bot } = require("./models");
        const activeBots = await Bot.findAll({ where: { is_active: true } });
        message += `*Database Active Bots:* ${activeBots.length}\n`;

        await ctx.replyWithMarkdown(message);
      } catch (error) {
        console.error("Debug command error:", error);
        await ctx.reply("❌ Debug command failed.");
      }
    });

    this.bot.command("reinit", async (ctx) => {
      try {
        const userId = ctx.from.id;
        if (userId !== 1827785384) {
          await ctx.reply("❌ Only bot owner can use this command.");
          return;
        }
        await ctx.reply("🔄 Forcing reinitialization of all mini-bots...");
        const result = await MiniBotManager.forceReinitializeAllBots();
        await ctx.reply(
          `✅ Reinitialization completed. ${result} bots configured.`,
        );
      } catch (error) {
        console.error("Reinit command error:", error);
        await ctx.reply("❌ Error during reinitialization.");
      }
    });

    this.bot.command("wallet_debug", async (ctx) => {
      try {
        const userId = ctx.from.id;
        const balance = await require("./services/walletService").getBalance(
          userId,
        );

        await ctx.replyWithMarkdown(
          `🔍 *Wallet Debug Info*\n\n` +
            `*User ID:* ${userId}\n` +
            `*Balance:* ${balance.balance.toFixed(2)} ${balance.currency}\n` +
            `*Status:* ${balance.isFrozen ? "Frozen ❄️" : "Active ✅"}\n` +
            `*Wallet Address:* BOTOMICS_${userId}\n\n` +
            `*Current Platform URL:* ${PUBLIC_URL}\n` +
            `*Wallet URL:* ${PUBLIC_URL}/wallet`,
        );
      } catch (error) {
        console.error("Wallet debug error:", error);
        await ctx.reply(`❌ Debug error: ${error.message}`);
      }
    });

    this.bot.command("railway_url", async (ctx) => {
      try {
        await ctx.replyWithMarkdown(
          `🌐 *Current Platform URLs*\n\n` +
            `*Public URL:* ${PUBLIC_URL}\n` +
            `*Wallet Mini-App:* ${PUBLIC_URL}/wallet\n` +
            `*API Base:* ${PUBLIC_URL}/api\n\n` +
            `*Save these URLs:*\n` +
            `• Wallet bookmark: ${PUBLIC_URL}/wallet\n` +
            `• Health check: ${PUBLIC_URL}/health\n` +
            `• Webhook endpoint: ${PUBLIC_URL}/webhook/:botId`,
        );
      } catch (error) {
        console.error("Railway URL command error:", error);
        await ctx.reply(`❌ Error getting URLs: ${error.message}`);
      }
    });

    // ========== SESSION MANAGEMENT COMMANDS ==========
    this.bot.command("sessions", async (ctx) => {
      try {
        const stats = SessionManager.getStats();
        await ctx.replyWithMarkdown(
          `📊 *Active Sessions*\n\n` +
            `*Total Sessions:* ${stats.total}\n` +
            `*Active (last 5 min):* ${stats.active}\n\n` +
            `*Cleanup:* Sessions auto-clear after 30 minutes of inactivity.`,
        );
      } catch (error) {
        console.error("Sessions command error:", error);
        await ctx.reply("❌ Error loading sessions.");
      }
    });

    // ========== TEXT MESSAGE HANDLER ==========
    this.bot.on("text", async (ctx) => {
      const userId = ctx.from.id;
      const messageText = ctx.message.text;

      // Platform admin session
      if (PlatformAdminHandler.isInPlatformAdminSession(userId)) {
        await PlatformAdminHandler.handlePlatformAdminInput(ctx);
        return;
      }

      // Cancel creation
      if (messageText === "🚫 Cancel Creation") {
        await cancelCreationHandler(ctx);
        return;
      }

      // Bot creation session
      if (isInCreationSession(userId)) {
        const step = getCreationStep(userId);
        if (step === "awaiting_token") {
          await handleTokenInput(ctx);
        } else if (step === "awaiting_name") {
          await handleNameInput(ctx);
        }
        return;
      }

      // Quick actions via text
      if (
        messageText.toLowerCase() === "wallet" ||
        messageText === "💰 wallet"
      ) {
        await this.openWalletMiniApp(ctx);
        return;
      }

      if (
        messageText.toLowerCase() === "premium" ||
        messageText === "🎫 premium"
      ) {
        await this.openWalletMiniApp(ctx, "premium");
        return;
      }

      if (
        messageText.toLowerCase() === "balance" ||
        messageText === "💰 balance"
      ) {
        await WalletHandler.handleWalletCommand(ctx);
        return;
      }

      // Admin quick access
      if (PlatformAdminHandler.isPlatformCreator(userId)) {
        if (
          messageText.toLowerCase() === "admin" ||
          messageText === "👑 admin"
        ) {
          await PlatformAdminHandler.platformDashboard(ctx);
          return;
        }

        if (
          messageText.toLowerCase() === "admin wallet" ||
          messageText === "🏦 admin wallet"
        ) {
          await PlatformAdminHandler.walletAdminDashboard(ctx);
          return;
        }
      }

      // Default to start handler
      await startHandler(ctx);
    });

    // ========== CALLBACK HANDLERS ==========
    this.setupCallbackHandlers();

    // Error handling
    this.bot.catch((err, ctx) => {
      console.error("❌ Main bot error:", err);
      try {
        ctx.reply("❌ An error occurred. Please try again.");
      } catch (e) {
        console.error("Failed to send error message:", e);
      }
    });

    console.log("✅ Main bot handlers setup complete");
  }

  setupMiniApp() {
    console.log("🔄 Setting up Mini App...");

    if (PUBLIC_URL.includes("localhost")) {
      console.log(
        "⚠️  Skipping chat menu button in localhost mode (HTTPS required)",
      );
      console.log("💡 Commands available: /wallet, /balance, /premium");
    } else {
      const walletUrl = `${PUBLIC_URL}/wallet`;
      console.log(`📱 Mini App URL: ${walletUrl}`);

      this.bot.telegram
        .setChatMenuButton({
          menu_button: {
            type: "web_app",
            text: "💰 Botomics Wallet",
            web_app: { url: walletUrl },
          },
        })
        .then(() => {
          console.log("✅ Chat menu button set successfully");
        })
        .catch((err) => {
          console.warn("⚠️  Could not set menu button:", err.message);
          console.log(
            "💡 This is normal in development or without bot permissions",
          );
        });

      config.WALLET_URL = walletUrl;
    }

    this.bot.on("web_app_data", async (ctx) => {
      try {
        const data = JSON.parse(ctx.webAppData.data);
        console.log("📱 Mini App data received:", data.action);

        const userId = ctx.from.id;

        switch (data.action) {
          case "get_balance":
            const walletService = require("./services/walletService");
            const balance = await walletService.getBalance(userId);
            await ctx.reply(
              `💰 *Your Wallet Balance*\n\n` +
                `*Balance:* ${balance.balance.toFixed(2)} ${balance.currency}\n` +
                `*Status:* ${balance.isFrozen ? "❄️ Frozen" : "✅ Active"}\n` +
                `*Address:* BOTOMICS_${userId}\n\n` +
                `*1 BOM = $1.00 USD*`,
              { parse_mode: "Markdown" },
            );
            break;

          case "get_public_url":
            await ctx.reply(
              `🌐 *Current Platform URL*\n\n` +
                `*Public URL:* ${PUBLIC_URL}\n` +
                `*Wallet URL:* ${config.WALLET_URL || `${PUBLIC_URL}/wallet`}\n` +
                `*API Base:* ${PUBLIC_URL}/api\n` +
                `*Environment:* ${process.env.NODE_ENV || "production"}\n\n` +
                `Bookmark this for direct access to your wallet.`,
              { parse_mode: "Markdown" },
            );
            break;

          case "premium_upgrade":
            try {
              await require("./services/subscriptionService").upgradeToPremium(
                userId,
              );
              await ctx.reply(
                "🎉 *Premium Subscription Activated!*\n\n" +
                  "Your premium subscription has been successfully activated.\n\n" +
                  "*Benefits:*\n" +
                  "✅ Unlimited bot creation\n" +
                  "✅ Unlimited broadcasts\n" +
                  "✅ All premium features unlocked\n\n" +
                  "Thank you for upgrading! 🚀",
                { parse_mode: "Markdown" },
              );
            } catch (error) {
              await ctx.reply(`❌ Error: ${error.message}`);
            }
            break;

          case "contact_support":
            await ctx.reply(
              "📞 *Botomics Support*\n\n" +
                "For assistance with:\n" +
                "• Buying BOM coins\n" +
                "• Wallet deposits/withdrawals\n" +
                "• Premium subscriptions\n" +
                "• Bot creation issues\n" +
                "• Technical problems\n\n" +
                "Contact: @BotomicsSupportBot\n\n" +
                "We typically respond within 24 hours.",
              { parse_mode: "Markdown" },
            );
            break;

          default:
            await ctx.reply("✅ Action processed in wallet Mini App.");
        }
      } catch (error) {
        console.error("Mini App error:", error);
        await ctx.reply(
          "❌ Mini App processing error. Please try again later.",
        );
      }
    });

    console.log("✅ Mini App setup complete");
  }

  async openWalletMiniApp(ctx, section = "main") {
    try {
      let baseUrl = PUBLIC_URL;

      if (baseUrl.startsWith("https://https://")) {
        baseUrl = baseUrl.replace("https://https://", "https://");
      }

      if (!baseUrl.startsWith("https://") && !baseUrl.startsWith("http://")) {
        baseUrl = `https://${baseUrl}`;
      }

      const walletUrl = `${baseUrl}/wallet`;
      const fullUrl =
        section !== "main" ? `${walletUrl}#${section}` : walletUrl;

      console.log(`🌐 Creating Web App button for Telegram`);
      console.log(`   Base URL: ${PUBLIC_URL}`);
      console.log(`   Cleaned URL: ${baseUrl}`);
      console.log(`   Wallet URL: ${fullUrl}`);
      console.log(`   User: ${ctx.from.id}`);

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.webApp("🔓 Open Botomics Wallet", fullUrl)],
        [Markup.button.callback("📞 Support", "contact_support")],
      ]);

      const message =
        "💰 Botomics Wallet\n\n" +
        "Access your wallet:\n\n" +
        '1. Click "Open Botomics Wallet" button below\n' +
        "2. Use the Mini App inside Telegram\n" +
        "3. Manage balance, transactions, and premium\n\n" +
        `Your Wallet Address: BOTOMICS_${ctx.from.id}\n` +
        "To buy BOM coins: Contact @BotomicsSupportBot\n\n" +
        "Features:\n" +
        "• View balance & transaction history\n" +
        "• Deposit & withdraw BOM coins\n" +
        "• Transfer BOM to other users\n" +
        "• Manage premium subscription";

      await ctx.reply(message, keyboard);
    } catch (error) {
      console.error("❌ Open wallet error:", error);

      try {
        const fallbackUrl = "https://botomics.up.railway.app/wallet";
        await ctx.reply(
          "💰 Open your wallet by clicking the menu button below 👇",
          Markup.inlineKeyboard([
            [Markup.button.webApp("Open Wallet", fallbackUrl)],
          ]),
        );
      } catch (fallbackError) {
        await ctx.reply(
          "❌ Error opening wallet. Please try /balance command instead.",
        );
      }
    }
  }

  setupCallbackHandlers() {
    console.log("🔄 Setting up main bot callback handlers...");

    // Register platform admin callbacks
    PlatformAdminHandler.registerCallbacks(this.bot);

    // ========== MENU NAVIGATION ==========
    this.bot.action("start", async (ctx) => {
      await ctx.answerCbQuery();
      await MenuHandler.handleMenu(ctx, "start");
    });

    this.bot.action("my_bots", async (ctx) => {
      await ctx.answerCbQuery();
      await MenuHandler.handleMenu(ctx, "my_bots");
    });

    this.bot.action("wallet_main", async (ctx) => {
      await ctx.answerCbQuery();
      await MenuHandler.handleMenu(ctx, "wallet");
    });

    this.bot.action("help", async (ctx) => {
      await ctx.answerCbQuery();
      await MenuHandler.handleMenu(ctx, "help");
    });

    this.bot.action("settings_menu", async (ctx) => {
      await ctx.answerCbQuery();
      await MenuHandler.handleMenu(ctx, "settings");
    });

    this.bot.action("back", async (ctx) => {
      await ctx.answerCbQuery();
      await MenuHandler.goBack(ctx);
    });

    // ========== PAGE NAVIGATION ==========
    this.bot.action(/menu_page_(\d+)/, async (ctx) => {
      const page = parseInt(ctx.match[1]);
      const userId = ctx.from.id;
      const session = SessionManager.getSession(userId);

      if (session && session.menu === "my_bots") {
        const { handleMyBotsPage } = require("./handlers/myBotsHandler");
        await handleMyBotsPage(ctx, page);
      } else {
        await ctx.answerCbQuery("❌ Session expired");
      }
    });

    // ========== FEATURES AND OTHER HANDLERS ==========
    this.bot.action("features", async (ctx) => {
      await ctx.answerCbQuery();
      await featuresHandler(ctx);
    });

    this.bot.action("create_bot", async (ctx) => {
      await ctx.answerCbQuery();
      await createBotHandler(ctx);
    });

    // ========== WALLET CALLBACKS ==========
    this.bot.action("wallet_main", async (ctx) => {
      await ctx.answerCbQuery();
      await WalletHandler.handleWalletCommand(ctx);
    });

    this.bot.action("wallet_deposit", async (ctx) => {
      await ctx.answerCbQuery();
      await WalletHandler.handleDeposit(ctx);
    });

    this.bot.action("wallet_withdraw", async (ctx) => {
      await ctx.answerCbQuery();
      await WalletHandler.handleWithdraw(ctx);
    });

    this.bot.action("wallet_transfer", async (ctx) => {
      await ctx.answerCbQuery();
      await WalletHandler.handleTransfer(ctx);
    });

    this.bot.action("wallet_premium", async (ctx) => {
      await ctx.answerCbQuery();
      await WalletHandler.handlePremium(ctx);
    });

    this.bot.action("wallet_history", async (ctx) => {
      await ctx.answerCbQuery();
      await WalletHandler.handleHistory(ctx, 0);
    });

    this.bot.action(/wallet_history_(\d+)/, async (ctx) => {
      const page = parseInt(ctx.match[1]);
      await ctx.answerCbQuery();
      await WalletHandler.handleHistory(ctx, page);
    });

    this.bot.action("wallet_upgrade_premium", async (ctx) => {
      await ctx.answerCbQuery();
      await WalletHandler.handleUpgradePremium(ctx);
    });

    this.bot.action("wallet_cancel_premium", async (ctx) => {
      await ctx.answerCbQuery();
      await WalletHandler.handleCancelPremium(ctx);
    });

    // ========== PRIVACY AND TERMS ==========
    this.bot.action("privacy_policy", async (ctx) => {
      await ctx.answerCbQuery();
      await this.privacyHandler(ctx);
    });

    this.bot.action("terms_of_service", async (ctx) => {
      await ctx.answerCbQuery();
      await this.termsHandler(ctx);
    });

    // ========== SUPPORT ==========
    this.bot.action("contact_support", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(
        "📞 *Botomics Support*\n\n" +
          "For assistance with:\n" +
          "• Buying BOM coins: Contact @BotomicsSupportBot\n" +
          "• Wallet deposits/withdrawals: Use Mini App\n" +
          "• Premium subscriptions: Use Mini App\n" +
          "• Bot creation issues: Use /help command\n" +
          "• Technical problems: Contact @BotomicsSupportBot\n\n" +
          "We typically respond within 24 hours.",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔙 Continue to Wallet",
                  web_app: { url: `${PUBLIC_URL}/wallet` },
                },
              ],
            ],
          },
        },
      );
    });

    // ========== BOT MANAGEMENT ==========
    this.bot.action(/bot_dashboard_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      const BotManagementHandler =
        require("./handlers/botManagementHandler").BotManagementHandler;
      await BotManagementHandler.handleBotDashboard(ctx, botId);
    });

    this.bot.action(/toggle_bot_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      const BotManagementHandler =
        require("./handlers/botManagementHandler").BotManagementHandler;
      await BotManagementHandler.handleToggleBot(ctx, botId);
    });

    this.bot.action(/delete_bot_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      const BotManagementHandler =
        require("./handlers/botManagementHandler").BotManagementHandler;
      await BotManagementHandler.handleDeleteBot(ctx, botId);
    });

    this.bot.action(/confirm_delete_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      const BotManagementHandler =
        require("./handlers/botManagementHandler").BotManagementHandler;
      await BotManagementHandler.handleConfirmDelete(ctx, botId);
    });

    this.bot.action(/admin_bot_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      const { adminHandler } = require("./handlers/adminHandler");
      await adminHandler(ctx, true, botId);
    });

    this.bot.action(/stats_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      const Bot = require("./models").Bot;
      const bot = await Bot.findByPk(botId);
      if (bot) {
        await ctx.reply(
          `📊 *Statistics for ${bot.bot_name}*\n\n` +
            `Please view statistics directly in your mini-bot:\n\n` +
            `Go to @${bot.bot_username} and use /stats`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.url(
                  `🔗 Open ${bot.bot_name}`,
                  `https://t.me/${bot.bot_username}`,
                ),
              ],
              [Markup.button.callback("📋 My Bots", "my_bots")],
            ]),
          },
        );
      }
    });

    // ========== PRODUCT CATALOG ==========
    this.bot.action(/catalog_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      await ctx.answerCbQuery();
      const MiniBotManager = require("./services/MiniBotManager");
      await MiniBotManager.handleProductCatalog(ctx, botId);
    });

    this.bot.action(/catalog_stats_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      await ctx.answerCbQuery();
      const MiniBotManager = require("./services/MiniBotManager");
      await MiniBotManager.showCatalogStats(ctx, botId);
    });

    this.bot.action(/product_view_(.+)/, async (ctx) => {
      const productId = ctx.match[1];
      await ctx.answerCbQuery();
      const MiniBotManager = require("./services/MiniBotManager");
      await MiniBotManager.handleProductView(ctx, productId);
    });

    this.bot.action(/product_manage_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      await ctx.answerCbQuery();
      const MiniBotManager = require("./services/MiniBotManager");
      await MiniBotManager.handleProductManagement(ctx, botId);
    });

    this.bot.action(/product_add_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      await ctx.answerCbQuery();
      const MiniBotManager = require("./services/MiniBotManager");
      await MiniBotManager.startAddProduct(ctx, botId);
    });

    this.bot.action(/orders_manage_(.+)/, async (ctx) => {
      const botId = ctx.match[1];
      await ctx.answerCbQuery();
      const MiniBotManager = require("./services/MiniBotManager");
      await MiniBotManager.handleOrderManagement(ctx, botId);
    });

    // ========== NO-OP ==========
    this.bot.action("noop", async (ctx) => {
      await ctx.answerCbQuery();
    });

    console.log("✅ Main bot callback handlers setup complete");
  }

  privacyHandler = async (ctx) => {
    try {
      const privacyMessage =
        `🔒 *Privacy Policy - Botomics*\n\n` +
        `*Last Updated: ${new Date().toISOString().split("T")[0]}*\n\n` +
        `*What Botomics Collect:*\n` +
        `• Basic Telegram profile info\n` +
        `• Wallet transaction data\n` +
        `• Bot creation and usage data\n` +
        `• Support communications\n\n` +
        `*How We Use Your Data:*\n` +
        `• To operate and maintain the Botomics platform\n` +
        `• To process wallet transactions\n` +
        `• To provide bot management features\n` +
        `• For customer support\n` +
        `• For service improvements\n\n` +
        `*Data Protection:*\n` +
        `• All data is encrypted at rest\n` +
        `• Database connections use SSL/TLS\n` +
        `• Regular security updates\n` +
        `• Access controls in place\n\n` +
        `*Your Rights:*\n` +
        `• Access your personal data\n` +
        `• Request data deletion\n` +
        `• Opt-out of communications\n\n` +
        `*Contact:*\n` +
        `Questions? Contact @BotomicsSupportBot\n\n` +
        `By using Botomics, you agree to our privacy practices.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("📋 Terms of Service", "terms_of_service")],
        [Markup.button.callback("🔙 Main Menu", "start")],
      ]);

      if (ctx.updateType === "callback_query") {
        await ctx.editMessageText(privacyMessage, {
          parse_mode: "Markdown",
          ...keyboard,
        });
      } else {
        await ctx.replyWithMarkdown(privacyMessage, keyboard);
      }
    } catch (error) {
      console.error("Privacy handler error:", error);
      await ctx.reply(
        `🔒 Privacy Policy\n\n` +
          `We protect your data and only collect necessary information to provide our services.\n\n` +
          `Contact @BotomicsSupportBot for any concerns.`,
        Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Main Menu", "start")],
        ]),
      );
    }
  };

  termsHandler = async (ctx) => {
    try {
      const termsMessage =
        `📋 *Terms of Service - Botomics*\n\n` +
        `*Last Updated: ${new Date().toISOString().split("T")[0]}*\n\n` +
        `*Acceptance of Terms:*\n` +
        `By using Botomics, you agree to these Terms of Service.\n\n` +
        `*Service Description:*\n` +
        `Botomics allows users to create and manage Telegram mini-bots with integrated wallet system.\n\n` +
        `*User Responsibilities:*\n` +
        `• You must own or have permission to use bot tokens\n` +
        `• You are responsible for your mini-bots' actions\n` +
        `• You must comply with Telegram's Terms of Service\n` +
        `• You must not use the service for illegal activities\n\n` +
        `*Wallet Terms:*\n` +
        `• 1 BOM = $1.00 USD fixed rate\n` +
        `• Minimum purchase: 5 BOM ($5.00)\n` +
        `• Minimum withdrawal: 20 BOM ($20.00)\n` +
        `• Processing times: 1-6 hours (deposits), 24 hours (withdrawals)\n` +
        `• Platform may freeze accounts for policy violations\n` +
        `• Only @BotomicsSupportBot is authorized to sell BOM coins\n\n` +
        `*Premium Subscription:*\n` +
        `• Price: 3 BOM per month or 30 BOM per year\n` +
        `• Auto-renewal enabled by default\n` +
        `• Cancel anytime, keep features until billing period ends\n\n` +
        `*Prohibited Uses:*\n` +
        `• Spamming, harassment, or abuse\n` +
        `• Illegal or fraudulent activities\n` +
        `• Money laundering or financial crimes\n` +
        `• Violating Telegram's Terms of Service\n\n` +
        `*Service Limitations:*\n` +
        `• Rate limiting applies to prevent abuse\n` +
        `• Features may change without notice\n` +
        `• Service availability not guaranteed\n\n` +
        `*Termination:*\n` +
        `We may suspend accounts for:\n` +
        `• Terms of Service violations\n` +
        `• Abuse of the service\n` +
        `• Illegal activities\n` +
        `• Fraudulent wallet activity\n\n` +
        `*Disclaimer:*\n` +
        `Service provided "as is" without warranties.\n\n` +
        `*Changes to Terms:*\n` +
        `We may update these terms with reasonable notice.\n\n` +
        `*Contact:*\n` +
        `Questions? Contact @BotomicsSupportBot\n\n` +
        `By using this service, you agree to these terms.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔒 Privacy Policy", "privacy_policy")],
        [Markup.button.callback("🔙 Main Menu", "start")],
      ]);

      if (ctx.updateType === "callback_query") {
        await ctx.editMessageText(termsMessage, {
          parse_mode: "Markdown",
          ...keyboard,
        });
      } else {
        await ctx.replyWithMarkdown(termsMessage, keyboard);
      }
    } catch (error) {
      console.error("Terms handler error:", error);
      await ctx.reply(
        `📋 Terms of Service\n\n` +
          `By using Botomics, you agree to use it responsibly and follow all platform rules.\n\n` +
          `Contact @BotomicsSupportBot for questions.`,
        Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Main Menu", "start")],
        ]),
      );
    }
  };

  async initialize() {
    try {
      console.log("🔄 Starting MetaBot Creator initialization...");

      console.log("⏳ Waiting for environment variables...");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const requiredVars = ["BOT_TOKEN", "DATABASE_URL", "ENCRYPTION_KEY"];
      const missingVars = requiredVars.filter(
        (varName) => !process.env[varName],
      );

      if (missingVars.length > 0) {
        console.error("❌ Still missing after wait:", missingVars);
        console.error("💡 Variables might not be set correctly.");

        const success = await this.retryInitialization();
        if (!success) {
          console.error("❌ Cannot continue without environment variables.");
          return;
        }
      }

      console.log("✅ Environment variables confirmed");
      console.log("🗄️ Connecting to Neon PostgreSQL database...");

      const { connectDB } = require("../database/db");
      await connectDB();

      const models = require("./models");

      console.log("🔄 Setting up Sequelize associations...");
      Object.keys(models).forEach((modelName) => {
        if (models[modelName] && models[modelName].associate) {
          try {
            models[modelName].associate(models);
            console.log(`✅ Associated: ${modelName}`);
          } catch (error) {
            console.error(
              `❌ Failed to associate ${modelName}:`,
              error.message,
            );
          }
        }
      });
      console.log("✅ All Sequelize associations set up");

      try {
        const {
          addWalletAddressField,
        } = require("../../scripts/add_wallet_address");
        await addWalletAddressField();
        console.log("✅ Wallet schema updated");
      } catch (error) {
        console.log(
          "⚠️  Wallet address script not found or failed, continuing...",
        );
      }

      console.log("✅ MetaBot Creator initialized successfully");
    } catch (error) {
      console.error("❌ Initialization failed:", error);
    }
  }

  async retryInitialization() {
    try {
      console.log("🔄 Retrying initialization...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const requiredVars = ["BOT_TOKEN", "DATABASE_URL", "ENCRYPTION_KEY"];
      const missingVars = requiredVars.filter(
        (varName) => !process.env[varName],
      );

      if (missingVars.length === 0) {
        console.log("✅ Variables loaded on retry!");
        return true;
      } else {
        console.error("❌ Still missing:", missingVars);
        return false;
      }
    } catch (error) {
      console.error("Retry initialization error:", error);
      return false;
    }
  }

  async start() {
    console.log("🚀 Starting MetaBot Creator on Render with WEBHOOKS...");

    try {
      const PORT = config.PORT;
      const HOST = config.HOST;

      let walletUrl, apiUrl, publicUrlDisplay;

      if (PUBLIC_URL.includes("localhost")) {
        walletUrl = `http://${HOST}:${PORT}/wallet`;
        apiUrl = `http://${HOST}:${PORT}/api/health`;
        publicUrlDisplay = `http://${HOST}:${PORT} (Local)`;
      } else if (PUBLIC_URL.includes("ngrok.io")) {
        walletUrl = `${PUBLIC_URL}/wallet`;
        apiUrl = `${PUBLIC_URL}/api/health`;
        publicUrlDisplay = `${PUBLIC_URL} (ngrok)`;
      } else {
        walletUrl = `${PUBLIC_URL}/wallet`;
        apiUrl = `${PUBLIC_URL}/api/health`;
        publicUrlDisplay = `${PUBLIC_URL} (Render)`;
      }

      config.WALLET_URL = walletUrl;
      config.APP_URL = PUBLIC_URL;

      this.expressApp.listen(PORT, HOST, () => {
        console.log(`🌐 Express server running on ${HOST}:${PORT}`);
        console.log(`📱 Wallet: ${walletUrl}`);
        console.log(`⚡ API: ${apiUrl}`);
        console.log(
          `🚀 Render Environment: ${process.env.RENDER_EXTERNAL_URL ? "Production" : "Not set"}`,
        );
        console.log(`🌐 Public URL: ${publicUrlDisplay}`);
        console.log(`🔗 Webhook endpoint: ${PUBLIC_URL}/webhook/:botId`);
        console.log(`🔗 Local URL: http://localhost:${PORT}`);
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log("\n⏰ Starting subscription cron jobs...");
      SubscriptionCron.start();
      console.log("✅ Subscription auto-renewal system started");

      console.log("\n🚀 Setting up mini-bot webhooks...");
      const miniBotsResult = await MiniBotManager.initializeAllBots();
      console.log(`✅ ${miniBotsResult} mini-bots configured with webhooks`);

      console.log("\n🤖 Starting main Telegram bot...");
      await this.bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: ["message", "callback_query", "web_app_data"],
      });

      console.log(
        "\n🎉 MetaBot Creator is now RUNNING on Render with WEBHOOKS!",
      );
      console.log("===============================================");
      console.log("🚀 Platform: Render (Webhook Architecture)");
      console.log("🌐 Public URL:", PUBLIC_URL);
      console.log("📱 Wallet URL:", PUBLIC_URL + "/wallet");
      console.log("🔗 Webhook URL:", PUBLIC_URL + "/webhook/:botId");
      console.log("🤖 Main Bot: Manages bot creation & wallet");
      console.log("🤖 Mini-bots: Webhook mode (NO polling)");
      console.log("💰 Botomics: Digital currency system");
      console.log("🎫 Premium: Subscription tiers (3 BOM/month)");
      console.log("⏰ Auto-renewal: Enabled (daily cron)");
      console.log("📊 Session Management: Enabled");
      console.log("🏦 ADMIN WALLET COMMANDS (Platform Creator Only):");
      console.log("   /platform - Platform admin dashboard");
      console.log("   /admin_wallet - Wallet admin dashboard");
      console.log("   /add_bom - Add BOM to user");
      console.log("   /freeze_wallet - Freeze user wallet");
      console.log("   /unfreeze_wallet - Unfreeze user wallet");
      console.log("   /grant_premium - Grant premium subscription");
      console.log("   /subscription_admin - Subscription admin");
      console.log("   /addbom <user> <amount> - Quick add BOM");
      console.log("   /sessions - View active sessions");
      console.log("===============================================");
      console.log(`🌐 Dashboard: ${PUBLIC_URL}`);
      console.log(`💰 Wallet: ${PUBLIC_URL}/wallet`);
      console.log(`💳 BOM Rate: 1 BOM = $1.00 USD`);
      console.log(`🔗 ${MiniBotManager.activeBots.size} bots on webhooks`);
      console.log(
        `📊 Active sessions: ${SessionManager.getStats ? SessionManager.getStats().active : 0}`,
      );
    } catch (error) {
      console.error("❌ Failed to start application:", error);
      console.error("Stack trace:", error.stack);
    }

    process.once("SIGINT", () => this.shutdown());
    process.once("SIGTERM", () => this.shutdown());
  }

  async shutdown() {
    console.log("\n🛑 Shutting down gracefully on Render...");

    if (this.bot) {
      await this.bot.stop();
      console.log("✅ Main bot stopped");
    }

    const activeBots = Array.from(MiniBotManager.activeBots.keys());
    console.log(`🔄 Stopping ${activeBots.length} mini-bot instances...`);

    for (const botId of activeBots) {
      try {
        await MiniBotManager.stopBot(botId);
      } catch (error) {
        console.error(`❌ Failed to stop mini-bot ${botId}:`, error);
      }
    }

    MiniBotManager.activeBots.clear();
    console.log("👋 All bots stopped");
    process.exit(0);
  }
}

async function startApplication() {
  try {
    console.log(
      "🔧 Starting MetaBot Creator application on Render with WEBHOOKS...",
    );

    const app = new MetaBotCreator();
    await app.initialize();
    await app.start();

    return app;
  } catch (error) {
    console.error("❌ Application failed to start:", error);
    setTimeout(() => process.exit(1), 5000);
  }
}

if (require.main === module) {
  startApplication();
}

module.exports = MetaBotCreator;
