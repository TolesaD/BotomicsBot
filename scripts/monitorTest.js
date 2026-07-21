// scripts/monitorTest.js - Monitor test bot activity
const fs = require("fs");
const path = require("path");

console.log("📊 Monitoring @BotomicsTestBot...");
console.log("Press Ctrl+C to stop\n");

// Watch test logs
const logFile = path.join(__dirname, "../logs/test.log");
if (fs.existsSync(logFile)) {
  fs.watch(logFile, (eventType) => {
    if (eventType === "change") {
      const content = fs.readFileSync(logFile, "utf8");
      const lines = content.split("\n").slice(-10);
      console.log("\n📝 Latest logs:");
      lines.forEach((line) => {
        if (line.includes("ERROR")) {
          console.log(`❌ ${line}`);
        } else if (line.includes("SUCCESS")) {
          console.log(`✅ ${line}`);
        } else if (line.includes("WARNING")) {
          console.log(`⚠️ ${line}`);
        } else if (line.trim()) {
          console.log(`📝 ${line}`);
        }
      });
    }
  });
} else {
  console.log("⚠️ No log file found. Make sure the test bot is running.");
}
