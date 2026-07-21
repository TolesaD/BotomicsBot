// scripts/setupTestWebhook.js - Setup webhook for test bot
require("dotenv").config({ path: ".env.test" });

const testToken = process.env.BOT_TOKEN;
const publicUrl = process.env.PUBLIC_URL || "http://localhost:3001";

async function setupWebhook() {
  console.log("🔗 Setting up test webhook...");
  console.log(`🤖 Token: ${testToken.substring(0, 20)}...`);
  console.log(`🌐 URL: ${publicUrl}`);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${testToken}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${publicUrl}/webhook`,
          allowed_updates: ["message", "callback_query", "edited_message"],
          drop_pending_updates: true,
          max_connections: 100,
        }),
      },
    );

    const data = await response.json();

    if (data.ok) {
      console.log("✅ Webhook set successfully!");

      const infoResponse = await fetch(
        `https://api.telegram.org/bot${testToken}/getWebhookInfo`,
      );
      const info = await infoResponse.json();
      console.log("📊 Webhook Status:", info);
    } else {
      console.error("❌ Webhook failed:", data.description);
    }
  } catch (error) {
    console.error("❌ Webhook error:", error.message);
  }
}

async function deleteWebhook() {
  console.log("🗑️ Deleting webhook...");
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${testToken}/deleteWebhook`,
    );
    const data = await response.json();
    console.log("✅ Webhook deleted:", data);
  } catch (error) {
    console.error("❌ Delete failed:", error.message);
  }
}

const command = process.argv[2] || "setup";
if (command === "delete") {
  deleteWebhook();
} else {
  setupWebhook();
}
