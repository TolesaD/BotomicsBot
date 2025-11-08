// test-minibots.js - Quick mini-bot test
require('dotenv').config();

async function testMiniBots() {
  console.log('🧪 Testing Mini-Bot Initialization...\n');
  
  try {
    // Connect to database
    const { connectDB } = require('./database/db');
    console.log('🗄️ Connecting to database...');
    await connectDB();
    
    // Check active bots
    const { Bot } = require('./src/models');
    const activeBots = await Bot.findAll({ where: { is_active: true } });
    
    console.log(`📊 Found ${activeBots.length} active bots in database:`);
    activeBots.forEach(bot => {
      console.log(`   - ${bot.bot_name} (ID: ${bot.id})`);
    });
    
    if (activeBots.length === 0) {
      console.log('\n❌ No active bots found. Create a bot first using /createbot');
      return;
    }
    
    // Test MiniBotManager directly
    const MiniBotManager = require('./src/services/MiniBotManager');
    
    console.log('\n🔄 Testing MiniBotManager...');
    const result = await MiniBotManager.initializeAllBots();
    
    console.log(`\n🎉 Result: ${result} mini-bots initialized successfully`);
    
    // Show active bots in memory
    console.log('\n📊 Active bots in memory:');
    MiniBotManager.debugActiveBots();
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMiniBots();