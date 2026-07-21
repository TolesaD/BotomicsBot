// scripts/verifyEnv.js - Verify environment setup
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env.test") });

console.log("🔍 Verifying Test Environment...");
console.log("================================\n");

const checks = {
  BOT_TOKEN: {
    value: process.env.BOT_TOKEN,
    required: true,
    check: (val) => val && val.length > 20,
  },
  DATABASE_URL: {
    value: process.env.DATABASE_URL,
    required: true,
    check: (val) => val && val.includes("postgresql://"),
  },
  ENCRYPTION_KEY: {
    value: process.env.ENCRYPTION_KEY,
    required: true,
    check: (val) => val && val.length > 10,
  },
  PUBLIC_URL: {
    value: process.env.PUBLIC_URL,
    required: true,
    check: (val) => val && val.startsWith("http"),
  },
  PORT: {
    value: process.env.PORT,
    required: true,
    check: (val) => val && !isNaN(val),
  },
  MAIN_BOT_USERNAME: {
    value: process.env.MAIN_BOT_USERNAME,
    required: true,
    check: (val) => val && val.includes("Bot"),
  },
};

let passed = 0;
let failed = 0;

for (const [key, check] of Object.entries(checks)) {
  const status = check.check(check.value);
  if (status) {
    console.log(`✅ ${key}: ${check.value.substring(0, 20)}...`);
    passed++;
  } else {
    console.log(
      `❌ ${key}: ${check.required ? "MISSING OR INVALID" : "Not set"}`,
    );
    failed++;
  }
}

console.log("\n================================");
console.log(`📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("✅ Environment is ready for testing!");
  console.log(`🤖 Test Bot: @${process.env.MAIN_BOT_USERNAME}`);
  console.log(`🌐 Test URL: ${process.env.PUBLIC_URL}`);
} else {
  console.log("⚠️ Please fix the issues above before running tests.");
}

// Check if token is valid
if (checks.BOT_TOKEN.check(checks.BOT_TOKEN.value)) {
  console.log("\n🔍 Testing bot token...");
  const token = process.env.BOT_TOKEN;
  fetch(`https://api.telegram.org/bot${token}/getMe`)
    .then((res) => res.json())
    .then((data) => {
      if (data.ok) {
        console.log(`✅ Token verified! Bot: @${data.result.username}`);
      } else {
        console.log(`❌ Token invalid: ${data.description}`);
      }
    })
    .catch((err) => {
      console.log(`❌ Error verifying token: ${err.message}`);
    });
}
