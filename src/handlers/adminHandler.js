const { Markup } = require('telegraf');
const { Bot, Admin, User } = require('../models');
const { checkAdminAccess, escapeMarkdown } = require('../utils/helpers');
const { validateUserId, validateUsername } = require('../utils/validators');
const config = require('../config/environment');
const SubscriptionService = require('../services/subscriptionService');

// Store admin management sessions
const adminSessions = new Map();

// Helper function to check co-admin limit
async function checkCoAdminLimit(userId, botId) {
  try {
    // Get user's subscription tier
    const tier = await SubscriptionService.getSubscriptionTier(userId);
    
    // Premium users have no limit
    if (tier === 'premium') {
      return { canAdd: true, reason: '', tier: 'premium' };
    }
    
    // Fremium users: count existing co-admins (excluding owner)
    const bot = await Bot.findByPk(botId);
    if (!bot) {
      return { canAdd: false, reason: 'Bot not found', tier: 'freemium' };
    }
    
    const coAdminCount = await Admin.count({
      where: {
        bot_id: botId,
        admin_user_id: { [require('sequelize').Op.ne]: bot.owner_id }
      }
    });
    
    // Fremium users can only have 1 co-admin
    if (coAdminCount >= 1) {
      return { 
        canAdd: false, 
        reason: `❌ *Freemium Co-Admin Limit Reached*\n\n` +
                `Freemium users can only have *1 co-admin*.\n` +
                `You currently have ${coAdminCount} co-admin(s).\n\n` +
                `💎 *Upgrade to Premium* for unlimited co-admins!`,
        tier: 'freemium',
        currentCount: coAdminCount,
        limit: 1
      };
    }
    
    return { canAdd: true, reason: '', tier: 'freemium', currentCount: coAdminCount, limit: 1 };
    
  } catch (error) {
    console.error('Check co-admin limit error:', error);
    return { canAdd: false, reason: 'Error checking limit', tier: 'freemium' };
  }
}

const adminHandler = async (ctx, isCallback = false, botId = null) => {
  try {
    let targetBotId = botId;
    
    if (!isCallback) {
      const commandParts = ctx.message.text.split(' ');
      if (commandParts.length < 2) {
        await ctx.reply('❌ Please specify a bot ID. Usage: /admins <bot_id>');
        return;
      }
      targetBotId = commandParts[1];
    }
    
    const userId = ctx.from.id;
    
    // Check access - only owners can manage admins
    const access = await checkAdminAccess(userId, targetBotId);
    
    if (!access.hasAccess || !access.isOwner) {
      const message = '❌ Only bot owners can manage admins.';
      if (isCallback) {
        await ctx.answerCbQuery(message);
      } else {
        await ctx.reply(message);
      }
      return;
    }
    
    // Check user's subscription tier
    const tier = await SubscriptionService.getSubscriptionTier(userId);
    const isPremium = tier === 'premium';
    
    // Count co-admins (excluding owner)
    const coAdminCount = await Admin.count({
      where: {
        bot_id: access.bot.id,
        admin_user_id: { [require('sequelize').Op.ne]: access.bot.owner_id }
      }
    });
    
    // Get current admins with proper association
    const admins = await Admin.findAll({
      where: { bot_id: access.bot.id },
      include: [{
        model: User,
        as: 'User',
        attributes: ['username', 'first_name'],
        required: false
      }],
      order: [['added_at', 'DESC']]
    });
    
    let message = `👥 *Admin Management for ${access.bot.bot_name}*\n\n` +
      `*Subscription:* ${isPremium ? '💎 Premium' : '🆓 Freemium'}\n` +
      `*Co-admin limit:* ${isPremium ? 'Unlimited' : '1 max'}\n` +
      `*Current co-admins:* ${coAdminCount}/${isPremium ? '∞' : '1'}\n\n` +
      `*Total Admins:* ${admins.length}\n\n` +
      `*Current Admins:*\n`;
    
    admins.forEach((admin, index) => {
      const userInfo = admin.User ? 
        `@${admin.User.username} (${admin.User.first_name})` : 
        `User#${admin.admin_user_id}`;
      
      const isOwner = admin.admin_user_id === access.bot.owner_id;
      
      message += `*${index + 1}.* ${userInfo} ${isOwner ? '👑' : ''}\n`;
      
      if (!isOwner) {
        const addedBy = admin.added_by === userId ? 'You' : `User#${admin.added_by}`;
        message += `Added by: ${addedBy}\n`;
      }
      
      message += `\n`;
    });
    
    message += `*Options:*`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('➕ Add Admin', `add_admin:${targetBotId}`)],
      admins.filter(a => a.admin_user_id !== access.bot.owner_id).length > 0 ? 
        [Markup.button.callback('➖ Remove Admin', `remove_admin:${targetBotId}`)] : [],
      [Markup.button.callback('🔙 Back', `manage_bot:${targetBotId}`)]
    ]);
    
    if (isCallback) {
      await ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        ...keyboard 
      });
    } else {
      await ctx.replyWithMarkdown(message, keyboard);
    }
    
    await ctx.answerCbQuery();
    
  } catch (error) {
    console.error('Admin handler error:', error);
    const message = '❌ Error loading admin management';
    if (isCallback) {
      await ctx.answerCbQuery(message);
    } else {
      await ctx.reply(message);
    }
  }
};

const addAdminHandler = async (ctx, botId) => {
  try {
    const userId = ctx.from.id;
    
    // Check access
    const access = await checkAdminAccess(userId, botId);
    
    if (!access.hasAccess || !access.isOwner) {
      await ctx.answerCbQuery('❌ Access denied');
      return;
    }
    
    // Check co-admin limit based on subscription tier
    const limitCheck = await checkCoAdminLimit(userId, botId);
    if (!limitCheck.canAdd) {
      const message = limitCheck.reason || '❌ Cannot add more co-admins.';
      
      await ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💎 Upgrade to Premium', 'premium_upgrade')],
          [Markup.button.callback('🔙 Back to Admins', `admins:${botId}`)]
        ])
      });
      return;
    }
    
    const message = `👥 *Add New Admin*\n\n` +
      `*Bot:* ${access.bot.bot_name}\n\n` +
      `Your subscription: *${limitCheck.tier === 'premium' ? '💎 Premium (Unlimited co-admins)' : '🆓 Freemium (1 co-admin max)'}*\n` +
      `Current co-admins: ${limitCheck.currentCount || 0}/${limitCheck.limit || 1}\n\n` +
      `Please provide the new admin's Telegram *User ID* or *Username*:\n\n` +
      `*How to get User ID:*\n` +
      `• Forward a message from the user to @userinfobot\n` +
      `• Or ask them to send /start to your bot\n\n` +
      `*Cancel:* Type /cancel anytime`;
    
    // Store session
    adminSessions.set(userId, {
      botId: access.bot.id,
      botName: access.bot.bot_name,
      action: 'add_admin'
    });
    
    await ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🚫 Cancel', `cancel_admin:${botId}`)]
      ])
    });
    
  } catch (error) {
    console.error('Add admin handler error:', error);
    await ctx.answerCbQuery('❌ Error adding admin');
  }
};

const removeAdminHandler = async (ctx, botId) => {
  try {
    const userId = ctx.from.id;
    
    // Check access
    const access = await checkAdminAccess(userId, botId);
    
    if (!access.hasAccess || !access.isOwner) {
      await ctx.answerCbQuery('❌ Access denied');
      return;
    }
    
    // Get non-owner admins
    const admins = await Admin.findAll({
      where: { 
        bot_id: access.bot.id,
        admin_user_id: { [require('sequelize').Op.ne]: access.bot.owner_id }
      },
      include: [{
        model: User,
        as: 'User',
        attributes: ['username', 'first_name'],
        required: false
      }]
    });
    
    if (admins.length === 0) {
      await ctx.answerCbQuery('❌ No admins to remove');
      return;
    }
    
    let message = `👥 *Remove Admin*\n\n` +
      `*Select an admin to remove:*\n\n`;
    
    admins.forEach((admin, index) => {
      const userInfo = admin.User ? 
        `@${admin.User.username} (${admin.User.first_name})` : 
        `User#${admin.admin_user_id}`;
      
      message += `*${index + 1}.* ${userInfo}\n`;
    });
    
    const keyboardButtons = admins.map(admin => [
      Markup.button.callback(
        `➖ Remove ${admin.User?.username || `User#${admin.admin_user_id}`}`,
        `confirm_remove_admin:${admin.id}:${botId}`
      )
    ]);
    
    keyboardButtons.push([
      Markup.button.callback('🔙 Back', `admins:${botId}`)
    ]);
    
    const keyboard = Markup.inlineKeyboard(keyboardButtons);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
  } catch (error) {
    console.error('Remove admin handler error:', error);
    await ctx.answerCbQuery('❌ Error removing admin');
  }
};

const confirmRemoveAdminHandler = async (ctx, adminId, botId) => {
  try {
    const userId = ctx.from.id;
    
    // Check access
    const access = await checkAdminAccess(userId, botId);
    
    if (!access.hasAccess || !access.isOwner) {
      await ctx.answerCbQuery('❌ Access denied');
      return;
    }
    
    const admin = await Admin.findByPk(adminId, {
      include: [{
        model: User,
        as: 'User',
        attributes: ['username', 'first_name'],
        required: false
      }]
    });
    
    if (!admin) {
      await ctx.answerCbQuery('❌ Admin not found');
      return;
    }
    
    // Prevent removing owner
    if (admin.admin_user_id === access.bot.owner_id) {
      await ctx.answerCbQuery('❌ Cannot remove bot owner');
      return;
    }
    
    const userInfo = admin.User ? 
      `@${admin.User.username} (${admin.User.first_name})` : 
      `User#${admin.admin_user_id}`;
    
    await admin.destroy();
    
    await ctx.editMessageText(
      `✅ *Admin Removed Successfully!*\n\n` +
      `*Removed:* ${userInfo}\n\n` +
      `They no longer have access to manage this bot.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back to Admins', `admins:${botId}`)]
        ])
      }
    );
    
  } catch (error) {
    console.error('Confirm remove admin error:', error);
    await ctx.answerCbQuery('❌ Error removing admin');
  }
};

const handleAdminInput = async (ctx) => {
  try {
    const userId = ctx.from.id;
    const session = adminSessions.get(userId);
    
    if (!session) return;
    
    if (ctx.message.text === '/cancel') {
      adminSessions.delete(userId);
      await ctx.reply('❌ Admin management cancelled.', Markup.removeKeyboard());
      return;
    }
    
    const input = ctx.message.text.trim();
    let targetUserId;
    let targetUsername;
    
    // Check if input is user ID (numeric)
    if (/^\d+$/.test(input)) {
      targetUserId = parseInt(input);
      const validation = validateUserId(targetUserId);
      if (!validation.valid) {
        await ctx.reply(`❌ ${validation.error} Please enter a valid User ID or username:`);
        return;
      }
    } else {
      // Input is username
      const validation = validateUsername(input.replace('@', ''));
      if (!validation.valid) {
        await ctx.reply(`❌ ${validation.error} Please enter a valid username:`);
        return;
      }
      targetUsername = input.replace('@', '');
    }
    
    if (session.action === 'add_admin') {
      await processAddAdmin(ctx, session, targetUserId, targetUsername);
    }
    
    adminSessions.delete(userId);
    
  } catch (error) {
    console.error('Handle admin input error:', error);
    await ctx.reply('❌ Error processing admin request.');
    adminSessions.delete(userId);
  }
};

async function processAddAdmin(ctx, session, targetUserId, targetUsername) {
  try {
    // Check co-admin limit again (in case something changed)
    const limitCheck = await checkCoAdminLimit(ctx.from.id, session.botId);
    if (!limitCheck.canAdd) {
      await ctx.reply(limitCheck.reason, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💎 Upgrade to Premium', 'premium_upgrade')],
          [Markup.button.callback('🔙 Back to Admins', `admins:${session.botId}`)]
        ])
      });
      return;
    }
    
    // If username provided, try to find user
    let finalUserId = targetUserId;
    if (targetUsername) {
      const user = await User.findOne({ where: { username: targetUsername } });
      if (!user) {
        await ctx.reply(`❌ User @${targetUsername} not found in our system. ` +
          `Ask them to start @${config.BOT_USERNAME} first.`);
        return;
      }
      finalUserId = user.telegram_id;
    }
    
    // Check if user is already an admin
    const existingAdmin = await Admin.findOne({
      where: { 
        bot_id: session.botId, 
        admin_user_id: finalUserId 
      }
    });
    
    if (existingAdmin) {
      await ctx.reply('❌ This user is already an admin of this bot.');
      return;
    }
    
    // Check if user is trying to add themselves
    if (finalUserId === ctx.from.id) {
      await ctx.reply('❌ You are already the owner of this bot.');
      return;
    }
    
    // Get target user info
    const targetUser = await User.findOne({ where: { telegram_id: finalUserId } });
    if (!targetUser) {
      await ctx.reply(`❌ User not found in our system. Ask them to start @${config.BOT_USERNAME} first.`);
      return;
    }
    
    // Add as admin
    await Admin.create({
      bot_id: session.botId,
      admin_user_id: finalUserId,
      admin_username: targetUser.username,
      added_by: ctx.from.id,
      permissions: {
        can_reply: true,
        can_broadcast: true,
        can_manage_admins: false,
        can_view_stats: true,
        can_deactivate: false
      }
    });
    
    const userDisplay = targetUser.username ? `@${targetUser.username}` : `User#${finalUserId}`;
    
    await ctx.reply(`✅ *${userDisplay} has been added as an admin!*\n\n` +
      `They can now:\n` +
      `• Reply to user messages\n` +
      `• Send broadcast messages\n` +
      `• View bot statistics\n\n` +
      `They can access the bot via /mybots`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('👥 Manage Admins', `admins:${session.botId}`)],
          [Markup.button.callback('🤖 Bot Dashboard', `manage_bot:${session.botId}`)]
        ])
      }
    );
    
  } catch (error) {
    console.error('Process add admin error:', error);
    throw error;
  }
}

const cancelAdminHandler = async (ctx, botId) => {
  const userId = ctx.from.id;
  adminSessions.delete(userId);
  
  await ctx.editMessageText('❌ Admin management cancelled.', 
    Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back to Admins', `admins:${botId}`)]
    ])
  );
};

// Check if user is in admin session
function isInAdminSession(userId) {
  return adminSessions.has(userId);
}

module.exports = { 
  adminHandler, 
  addAdminHandler, 
  removeAdminHandler,
  confirmRemoveAdminHandler,
  handleAdminInput, 
  cancelAdminHandler,
  isInAdminSession,
  adminSessions 
};

// Register admin callbacks for main bot
module.exports.registerAdminCallbacks = (bot) => {
  bot.action(/admins:(.+)/, async (ctx) => {
    const botId = ctx.match[1];
    await adminHandler(ctx, true, botId);
  });
  
  bot.action(/add_admin:(.+)/, async (ctx) => {
    const botId = ctx.match[1];
    await addAdminHandler(ctx, botId);
  });
  
  bot.action(/remove_admin:(.+)/, async (ctx) => {
    const botId = ctx.match[1];
    await removeAdminHandler(ctx, botId);
  });
  
  bot.action(/confirm_remove_admin:(.+):(.+)/, async (ctx) => {
    const adminId = ctx.match[1];
    const botId = ctx.match[2];
    await confirmRemoveAdminHandler(ctx, adminId, botId);
  });
  
  bot.action(/cancel_admin:(.+)/, async (ctx) => {
    const botId = ctx.match[1];
    await cancelAdminHandler(ctx, botId);
  });
};