// debugMiniBots.js
const { Bot } = require('./src/models');
const MiniBotManager = require('./src/services/MiniBotManager');

async function debugMiniBots() {
  console.log('🐛 DEBUG: Mini-bot Initialization Debug\n');
  
  try {
    // Test database connection
    console.log('1. Testing database connection...');
    const activeBots = await Bot.findAll({ where: { is_active: true } });
    console.log(`✅ Found ${activeBots.length} active bots in database`);
    
    // Test each bot individually
    for (const bot of activeBots) {
      console.log(`\n--- Testing Bot: ${bot.bot_name} (ID: ${bot.id}) ---`);
      
      try {
        // Test token decryption
        console.log('   Testing token decryption...');
        const token = bot.getDecryptedToken();
        if (!token) {
          console.log('   ❌ No token available');
          continue;
        }
        console.log(`   ✅ Token available: ${token.substring(0, 10)}...`);
        
        // Test token format
        const isValid = MiniBotManager.isValidBotToken(token);
        console.log(`   ✅ Token format valid: ${isValid}`);
        
        // Test token with Telegram API
        console.log('   Testing token with Telegram API...');
        const tokenValid = await MiniBotManager.validateBotToken(token);
        console.log(`   ✅ Token valid with Telegram: ${tokenValid}`);
        
        if (tokenValid) {
          console.log(`   🎉 Bot ${bot.bot_name} is READY for initialization`);
        } else {
          console.log(`   ❌ Bot ${bot.bot_name} has INVALID token`);
        }
        
      } catch (error) {
        console.log(`   💥 Error testing bot: ${error.message}`);
      }
    }
    
    // Test initialization
    console.log('\n--- Testing MiniBotManager Initialization ---');
    const result = await MiniBotManager.initializeAllBots();
    console.log(`🎯 Initialization result: ${result} bots started`);
    
    MiniBotManager.debugActiveBots();
    
  } catch (error) {
    console.error('💥 Debug failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  debugMiniBots().then(() => {
    console.log('\n🔚 Debug completed');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Debug error:', error);
    process.exit(1);
  });
}

module.exports = debugMiniBots;