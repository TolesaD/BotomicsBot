// workers/index.js - Complete Cloudflare Worker for Botomics

// ============================================
// CONFIGURATION
// ============================================
const TELEGRAM_API = "https://api.telegram.org";

// ============================================
// MAIN HANDLER
// ============================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ============ HEALTH CHECK ============
    if (path === "/health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          service: "botomics-webhook",
          timestamp: new Date().toISOString(),
          environment: "cloudflare-workers",
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // ============ TEST ENDPOINT ============
    if (path === "/test") {
      return new Response(
        JSON.stringify({
          status: "ok",
          message: "Worker is running!",
          timestamp: new Date().toISOString(),
          mode: "webhook-handler",
          endpoints: {
            health: "/health",
            test: "/test",
            webhook: "/webhook/:botId",
            setWebhook: "/set-webhook/:botId/:token",
            wallet: "/wallet",
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // ============ WEBHOOK HANDLER ============
    // Format: /webhook/{botId}
    if (path.startsWith("/webhook/")) {
      const botId = path.split("/")[2];

      if (!botId) {
        return new Response("Missing bot ID", { status: 400 });
      }

      try {
        // Get the update from Telegram
        const update = await request.json();

        // Get bot token from database
        const token = await getBotToken(botId, env);

        if (!token) {
          console.error(`❌ Bot ${botId} not found or inactive`);
          return new Response("Bot not found", { status: 404 });
        }

        // Process the update
        await processUpdate(update, token, botId, env);

        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("Webhook error:", error);
        return new Response("Error: " + error.message, { status: 500 });
      }
    }

    // ============ SET WEBHOOK ENDPOINT ============
    // Format: /set-webhook/{botId}/{token}
    if (path.startsWith("/set-webhook/")) {
      const parts = path.split("/");
      const botId = parts[2];
      const botToken = parts[3];

      if (!botId || !botToken) {
        return new Response("Missing botId or token", { status: 400 });
      }

      try {
        const workerUrl = `https://${request.headers.get("host")}/webhook/${botId}`;

        const response = await fetch(
          `${TELEGRAM_API}/bot${botToken}/setWebhook`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: workerUrl,
              allowed_updates: ["message", "callback_query", "edited_message"],
              drop_pending_updates: true,
            }),
          },
        );

        const data = await response.json();

        return new Response(
          JSON.stringify({
            ok: data.ok,
            description: data.description,
            webhook_url: workerUrl,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        return new Response("Error: " + error.message, { status: 500 });
      }
    }

    // ============ WALLET ROUTE ============
    // Serve wallet if /wallet is accessed
    if (path.startsWith("/wallet")) {
      // Try to serve the wallet page from the wallet folder
      // Cloudflare will handle this if you have static assets configured
      return fetch(request);
    }

    // ============ ROOT ENDPOINT ============
    // Default response for root
    return new Response(
      JSON.stringify({
        status: "ok",
        message: "Botomics Webhook Worker is running!",
        version: "2.0.0",
        endpoints: {
          health: "/health",
          test: "/test",
          webhook: "/webhook/:botId",
          setWebhook: "/set-webhook/:botId/:token",
          wallet: "/wallet",
        },
        docs: "https://github.com/TolesaD/BotomicsBot",
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get bot token from database
async function getBotToken(botId, env) {
  try {
    // Use Neon's HTTP API
    const response = await fetch(env.DATABASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "SELECT bot_token FROM bots WHERE id = $1 AND is_active = true",
        params: [parseInt(botId)],
      }),
    });

    if (!response.ok) {
      console.error("Database query failed:", await response.text());
      return null;
    }

    const data = await response.json();

    if (data.rows && data.rows.length > 0) {
      return data.rows[0].bot_token;
    }

    return null;
  } catch (error) {
    console.error("Database error:", error);
    return null;
  }
}

// Process the Telegram update
async function processUpdate(update, token, botId, env) {
  console.log(`📨 Processing update for bot ${botId}`);

  // ============ MESSAGE HANDLER ============
  if (update.message) {
    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text || "";
    const firstName = message.from?.first_name || "User";
    const username = message.from?.username || "user";

    console.log(`💬 Message from ${firstName} (@${username}): ${text}`);

    // Handle /start command
    if (text.startsWith("/start")) {
      await sendMessage(
        chatId,
        token,
        `👋 *Welcome to Bot ${botId}!*\n\n` +
          `I'm your personal assistant. How can I help you?\n\n` +
          `*Available Commands:*\n` +
          `/help - Get help\n` +
          `/about - About this bot\n\n` +
          `_Powered by Botomics Platform_`,
      );
      return;
    }

    // Handle /help command
    if (text === "/help" || text.startsWith("/help")) {
      await sendMessage(
        chatId,
        token,
        `🤖 *Help Center*\n\n` +
          `*Available Commands:*\n` +
          `/start - Start the bot\n` +
          `/help - Get help\n` +
          `/about - About this bot\n\n` +
          `*Need support?* Contact the bot owner.\n\n` +
          `_Your Bot ID: ${botId}_`,
      );
      return;
    }

    // Handle /about command
    if (text === "/about" || text.startsWith("/about")) {
      await sendMessage(
        chatId,
        token,
        `ℹ️ *About This Bot*\n\n` +
          `Bot ID: ${botId}\n` +
          `Platform: Botomics\n` +
          `Architecture: Cloudflare Workers\n` +
          `Database: Neon PostgreSQL\n\n` +
          `*Created with ❤️ using Botomics Platform*`,
      );
      return;
    }

    // Default response for other messages
    await sendMessage(
      chatId,
      token,
      `📨 *Message Received*\n\n` +
        `You said: "${text}"\n\n` +
        `Bot ID: ${botId}\n` +
        `User: ${firstName}\n\n` +
        `_I'm processing your request..._`,
    );
  }

  // ============ CALLBACK QUERY HANDLER ============
  if (update.callback_query) {
    const query = update.callback_query;
    const chatId = query.message.chat.id;
    const data = query.data;
    const username = query.from?.username || "User";

    console.log(`🔘 Callback from ${username}: ${data}`);

    await sendMessage(
      chatId,
      token,
      `✅ *Action Confirmed*\n\n` +
        `You clicked: ${data}\n\n` +
        `_Processing your request..._`,
    );
  }
}

// Send message helper
async function sendMessage(chatId, token, text, parseMode = "Markdown") {
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: parseMode,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to send message:", errorText);
      throw new Error(`Telegram API error: ${response.status} - ${errorText}`);
    }

    return response;
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
}
