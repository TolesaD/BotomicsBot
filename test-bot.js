const { Telegraf } = require('telegraf');

console.log('🤖 Testing basic Telegraf bot...');

const bot = new Telegraf('7983296108:AAH8Dj_5WfhPN7g18jFI2VsexzJAiCjPgpI');

bot.start((ctx) => ctx.reply('Test bot is working!'));
bot.help((ctx) => ctx.reply('Help message'));

console.log('🚀 Launching test bot...');

bot.launch({
  dropPendingUpdates: true,
  polling: {
    timeout: 30,
    limit: 100
  }
})
.then(() => {
  console.log('✅ Test bot launched successfully!');
  console.log('💬 Send /start to your bot to test');
})
.catch(error => {
  console.error('❌ Test bot failed:', error.message);
  console.error('💡 This confirms Telegraf has issues on Railway');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));