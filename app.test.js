// app.test.js - Test entry point
require("dotenv").config({ path: ".env.test" });

console.log("🧪 BOTOMICS TEST MODE");
console.log("=====================");
console.log(`🤖 Test Bot: @${process.env.MAIN_BOT_USERNAME}`);
console.log(`🌐 Test URL: ${process.env.PUBLIC_URL}`);
console.log(`🗄️ Test Database: ${process.env.DATABASE_URL}`);
console.log("=====================\n");

// Import and run the main app with test config
const MetaBotCreator = require("./src/app");
const app = new MetaBotCreator();

app
  .initialize()
  .then(() => {
    console.log("✅ Test bot initialized");
    app.start();
  })
  .catch((err) => {
    console.error("❌ Test bot failed to start:", err);
  });

// Handle test-specific shutdown
process.on("SIGINT", () => {
  console.log("\n🧪 Test bot shutting down...");
  process.exit(0);
});
