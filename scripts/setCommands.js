const { Telegraf } = require('telegraf');

// Load environment the same way as app.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
  console.log('🔧 Development mode - Loading .env file');
} else {
  console.log('🚀 Production mode - Using environment variables');
}

async function setCommands() {
  try {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    
    if (!BOT_TOKEN) {
      console.error('❌ BOT_TOKEN is required but not set');
      console.log('💡 How to fix:');
      console.log('   1. Create .env file with BOT_TOKEN=your_bot_token');
      console.log('   2. Or set BOT_TOKEN environment variable');
      console.log('   3. For cPanel: Add BOT_TOKEN in Environment Variables');
      process.exit(1);
    }
    
    console.log(`🤖 Setting commands for main bot...`);
    
    const bot = new Telegraf(BOT_TOKEN);
    
    // Set the same commands for ALL users in main bot
    await bot.telegram.setMyCommands([
      { command: 'start', description: '🚀 Start the bot' },
      { command: 'createbot', description: '🤖 Create a new mini-bot' },
      { command: 'mybots', description: '📊 My bots dashboard' },
      { command: 'help', description: '❓ Get help' },
      { command: 'privacy', description: '🔒 Privacy Policy' },
      { command: 'terms', description: '📋 Terms of Service' }
    ]);
    
    console.log('✅ Main bot commands set successfully for ALL users!');
    console.log('📋 All users will see:');
    console.log('   🚀 Start the bot');
    console.log('   🤖 Create a new mini-bot');
    console.log('   📊 My bots dashboard');
    console.log('   ❓ Get help');
    console.log('   🔒 Privacy Policy');
    console.log('   📋 Terms of Service');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to set commands:', error.message);
    process.exit(1);
  }
}

setCommands();