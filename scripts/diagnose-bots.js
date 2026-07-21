// scripts/diagnose-bots.js
const { Bot } = require('../src/models');
const { connectDB } = require('../database/db');

async function diagnoseBots() {
  console.log('🔍 Diagnosing bot tokens...');
  
  await connectDB();
  
  const bots = await Bot.findAll();
  console.log(`📊 Found ${bots.length} bots in database`);
  
  const results = [];
  
  for (const bot of bots) {
    console.log(`\n🤖 Testing bot: ${bot.bot_name} (ID: ${bot.id})`);
    
    // Test token decryption
    const decryptionTest = bot.testTokenDecryption();
    console.log(`   🔐 Decryption: ${decryptionTest.success ? '✅' : '❌'} ${decryptionTest.message}`);
    
    // Test token with Telegram API
    const tokenTest = await bot.testToken();
    console.log(`   🤖 Telegram API: ${tokenTest.success ? '✅' : '❌'} ${tokenTest.error || 'Valid'}`);
    
    results.push({
      id: bot.id,
      name: bot.bot_name,
      username: bot.bot_username,
      is_active: bot.is_active,
      decryption_success: decryptionTest.success,
      telegram_api_success: tokenTest.success,
      error: tokenTest.error
    });
    
    // If token is invalid, deactivate the bot
    if (!tokenTest.success && bot.is_active) {
      console.log(`   🚫 Deactivating invalid bot: ${bot.bot_name}`);
      bot.is_active = false;
      await bot.save();
    }
  }
  
  console.log('\n📋 DIAGNOSIS SUMMARY:');
  console.log('====================');
  
  const validBots = results.filter(r => r.telegram_api_success);
  const invalidBots = results.filter(r => !r.telegram_api_success);
  
  console.log(`✅ Valid bots: ${validBots.length}`);
  validBots.forEach(bot => {
    console.log(`   - ${bot.name} (@${bot.username})`);
  });
  
  console.log(`\n❌ Invalid bots: ${invalidBots.length}`);
  invalidBots.forEach(bot => {
    console.log(`   - ${bot.name} (@${bot.username}) - ${bot.error}`);
  });
  
  process.exit(0);
}

diagnoseBots().catch(console.error);