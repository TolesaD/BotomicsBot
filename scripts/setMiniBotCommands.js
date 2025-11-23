const { Telegraf } = require('telegraf');
const { Bot } = require('../src/models');
const { connectDB } = require('../database/db');

async function setMiniBotCommands() {
  try {
    await connectDB();
    
    const activeBots = await Bot.findAll({ where: { is_active: true } });
    
    console.log(`🔄 Setting commands for ${activeBots.length} mini-bots...`);
    
    for (const botRecord of activeBots) {
      try {
        const token = botRecord.getDecryptedToken();
        if (!token) continue;
        
        const bot = new Telegraf(token);
        
        // ✅ FIXED: Set different commands based on bot type
        if (botRecord.bot_type === 'custom') {
          // Custom Bot Commands
          await bot.telegram.setMyCommands([
            { command: 'start', description: '🚀 Start the bot' },
            { command: 'help', description: '❓ Get help' },
            { command: 'commands', description: '📋 List custom commands' }
          ], {
            scope: { type: 'all_private_chats' }
          });
          console.log(`✅ CUSTOM Bot commands set for ${botRecord.bot_name}`);
        } else {
          // Quick Bot Commands (default)
          await bot.telegram.setMyCommands([
            { command: 'start', description: '🚀 Start the bot' },
            { command: 'dashboard', description: '📊 Admin dashboard' },
            { command: 'broadcast', description: '📢 Send broadcast' },
            { command: 'stats', description: '📈 View statistics' },
            { command: 'admins', description: '👥 Manage admins' },
            { command: 'settings', description: '⚙️ Bot settings' },
            { command: 'help', description: '❓ Get help' }
          ], {
            scope: { type: 'all_private_chats' }
          });
          console.log(`✅ QUICK Bot commands set for ${botRecord.bot_name}`);
        }
        
        await bot.stop();
      } catch (error) {
        console.error(`❌ Failed to set commands for ${botRecord.bot_name}:`, error.message);
      }
    }
    
    console.log('✅ All mini-bot commands set successfully with proper bot types!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to set mini-bot commands:', error);
    process.exit(1);
  }
}

setMiniBotCommands();