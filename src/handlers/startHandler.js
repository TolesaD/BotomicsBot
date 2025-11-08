const { Markup } = require('telegraf');
const User = require('../models/User');

const startHandler = async (ctx) => {
  try {
    const user = ctx.from;
    
    // Save/update user in database
    await User.upsert({
      telegram_id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      language_code: user.language_code,
      last_active: new Date()
    });

    const welcomeMessage = `🤖 *Welcome to MarCreatorBot!*\n\n` +
      `*The Ultimate Telegram Bot Management Platform*\n\n` +
      `✨ *Create & Manage Your Own Bots:*\n` +
      `• 🚀 Create mini-bots without coding\n` +
      `• 💬 Real-time messaging\n` +
      `• 📢 Broadcast to all users\n` +
      `• 👥 Multi-admin support\n` +
      `• 📊 Detailed analytics\n` +
      `• ⚡ Instant notifications\n\n` +
      `🎯 *How It Works:*\n` +
      `1. Create bot with @BotFather\n` +
      `2. Add it here using /createbot\n` +
      `3. Manage it DIRECTLY in the mini-bot\n` +
      `4. Get instant notifications for new messages\n\n` +
      `*🚀 All management happens in your mini-bots!*\n\n` +
      `🔒 *Legal & Privacy:*\n` +
      `By using this bot, you agree to our:\n` +
      `/terms - Terms of Service\n` +
      `/privacy - Privacy Policy`;

    // Same keyboard for ALL users in main bot
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Create New Bot', 'create_bot')],
      [
        Markup.button.callback('📊 My Bots Dashboard', 'my_bots'),
        Markup.button.callback('❓ Help Guide', 'help')
      ],
      [
        Markup.button.callback('🔒 Privacy', 'privacy_policy'),
        Markup.button.callback('📋 Terms', 'terms_of_service')
      ]
    ]);

    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText(welcomeMessage, {
        parse_mode: 'Markdown',
        ...keyboard
      });
      await ctx.answerCbQuery();
    } else {
      await ctx.replyWithMarkdown(welcomeMessage, keyboard);
    }
    
  } catch (error) {
    console.error('Start handler error:', error);
    
    // Fallback
    try {
      await ctx.reply(
        `🤖 Welcome to MarCreatorBot!\n\n` +
        `Create and manage Telegram bots without coding.\n\n` +
        `All management happens in your mini-bots!\n\n` +
        `Legal: /privacy & /terms\n\n` +
        `Use the buttons below:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🚀 Create Bot', 'create_bot')],
          [Markup.button.callback('📊 My Bots', 'my_bots')],
          [Markup.button.callback('❓ Help', 'help')]
        ])
      );
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      await ctx.reply(
        'Welcome to MarCreatorBot! Use /createbot to make a bot.'
      );
    }
  }
};

const helpHandler = async (ctx) => {
  try {
    // Same help content for ALL users in main bot
    const helpMessage = `📖 *MarCreatorBot - Complete Help Guide*\n\n` +
      `*🚀 Getting Started:*\n` +
      `1. Create bot via @BotFather\n` +
      `2. Use /createbot to add it here\n` +
      `3. Go to your mini-bot and use /dashboard\n` +
      `4. Start managing immediately!\n\n` +
      `*🔧 Main Commands (in this bot):*\n` +
      `/start - Show main menu\n` +
      `/createbot - Create new mini-bot\n` +
      `/mybots - List your bots\n` +
      `/help - This help message\n` +
      `/privacy - Privacy Policy\n` +
      `/terms - Terms of Service\n\n` +
      `*🤖 Mini-Bot Management:*\n` +
      `• Users message your mini-bot\n` +
      `• You get INSTANT notifications\n` +
      `• Reply directly from notifications\n` +
      `• Use /dashboard in mini-bot for full features\n\n` +
      `*📊 Management Features (in mini-bots):*\n` +
      `/dashboard - Full admin panel\n` +
      `/messages - View all user messages\n` +
      `/broadcast - Send to all users\n` +
      `/stats - View statistics\n` +
      `/admins - Manage team (owners only)\n\n` +
      `*💡 Pro Tips:*\n` +
      `• Use bot commands/Menu for quick access\n` +
      `• Click notification buttons to reply instantly\n` +
      `• Add co-admins to help manage\n` +
      `• Broadcast important announcements\n\n` +
      `*🔒 Legal & Support:*\n` +
      `/privacy - View Privacy Policy\n` +
      `/terms - View Terms of Service\n` +
      `Contact @MarCreatorSupportBot for help`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Create Your First Bot', 'create_bot')],
      [Markup.button.callback('📊 My Bots Dashboard', 'my_bots')],
      [
        Markup.button.callback('🔒 Privacy', 'privacy_policy'),
        Markup.button.callback('📋 Terms', 'terms_of_service')
      ],
      [Markup.button.callback('🔙 Main Menu', 'start')]
    ]);

    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText(helpMessage, {
        parse_mode: 'Markdown',
        ...keyboard
      });
      await ctx.answerCbQuery();
    } else {
      await ctx.replyWithMarkdown(helpMessage, keyboard);
    }
    
  } catch (error) {
    console.error('Help handler error:', error);
    await ctx.reply(
      `🤖 MarCreatorBot Help\n\n` +
      `Main Commands:\n` +
      `/start - Main menu\n` +
      `/createbot - Create bot\n` +
      `/mybots - List bots\n` +
      `/help - Help guide\n` +
      `/privacy - Privacy Policy\n` +
      `/terms - Terms of Service\n\n` +
      `Manage bots in the mini-bots using /dashboard`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🚀 Create Bot', 'create_bot')],
        [Markup.button.callback('🔙 Main Menu', 'start')]
      ])
    );
  }
};

// ... rest of the file remains the same ...

module.exports = { 
  startHandler, 
  helpHandler, 
  featuresHandler,
  defaultHandler 
};