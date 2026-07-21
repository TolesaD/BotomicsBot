// src/scripts/checkInactive.js - Check Inactive Bots Script
require("dotenv").config();

const { Bot } = require("../models");
const { connectDB } = require("../../database/db");
const InactivityService = require("../services/inactivityService");

async function checkInactive() {
  console.log("🔍 Checking inactive bots...");
  console.log("=====================================");

  try {
    await connectDB();
    console.log("✅ Database connected");

    const results = await InactivityService.checkAllBots();

    console.log(`\n📊 Found ${results.length} bots with activity data`);

    // Filter bots that need attention
    const needReminder = results.filter((r) => r && r.shouldRemind);
    const needDeletion = results.filter((r) => r && r.shouldDelete);

    console.log(`\n📋 Summary:`);
    console.log(`   ⏰ Need reminder: ${needReminder.length}`);
    console.log(`   🗑️ Need deletion: ${needDeletion.length}`);

    // Show bots needing reminders
    if (needReminder.length > 0) {
      console.log(`\n📨 Bots needing reminders:`);
      needReminder.forEach((r) => {
        console.log(`   - ${r.botName} (${r.monthsInactive} months)`);
      });
    }

    // Show bots needing deletion
    if (needDeletion.length > 0) {
      console.log(`\n🗑️ Bots marked for deletion:`);
      needDeletion.forEach((r) => {
        console.log(`   - ${r.botName} (${r.monthsInactive} months)`);
      });
    }

    console.log("\n🎉 Check complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkInactive();
