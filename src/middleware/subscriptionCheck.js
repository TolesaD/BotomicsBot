const SubscriptionService = require('../services/subscriptionService');
const { Markup } = require('telegraf');

class SubscriptionMiddleware {
  static checkFeature(feature) {
    return async (ctx, next) => {
      try {
        const userId = ctx.from.id;
        const hasAccess = await SubscriptionService.checkFeatureAccess(userId, feature);
        
        if (hasAccess === false) {
          await ctx.reply(
            `❌ *Premium Feature Required*\n\n` +
            `This feature requires a premium subscription.\n\n` +
            `💎 *Upgrade to unlock:*\n` +
            `• ${this.getFeatureDescription(feature)}\n` +
            `• All premium features\n` +
            `• Ad-free experience\n\n` +
            `*Price:* 3 BOM per month ($3.00)`,
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('💎 Upgrade to Premium', 'premium_upgrade')],
                [Markup.button.callback('🔙 Back', 'start')]
              ])
            }
          );
          return;
        }
        
        ctx.subscriptionLimit = hasAccess;
        return next();
        
      } catch (error) {
        console.error('Subscription check error:', error);
        await ctx.reply('❌ Error checking subscription access.');
        return next();
      }
    };
  }

  static checkBotCreation() {
    return async (ctx, next) => {
      try {
        const userId = ctx.from.id;
        const botCheck = await SubscriptionService.canUserCreateBot(userId);
        
        if (!botCheck.canCreate) {
          await ctx.reply(
            `❌ *${botCheck.botLimit === 5 ? 'Freemium Limit Reached' : 'Bot Limit Reached'}*\n\n` +
            `You have created ${botCheck.currentCount}/${botCheck.botLimit} bots.\n\n` +
            `*Freemium:* 5 bots max\n` +
            `*Premium:* 50 bots\n\n` +
            `💎 Upgrade to Premium for more bots!`,
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('💎 Upgrade to Premium', 'premium_upgrade')],
                [Markup.button.callback('🔙 Main Menu', 'start')]
              ])
            }
          );
          return;
        }
        
        ctx.botCreationLimit = botCheck;
        return next();
        
      } catch (error) {
        console.error('Bot creation check error:', error);
        return next();
      }
    };
  }

  static checkBroadcastLimit() {
    return async (ctx, next) => {
      try {
        const userId = ctx.from.id;
        const botId = ctx.metaBotInfo?.mainBotId;
        
        if (!botId) {
          return next();
        }
        
        const broadcastCheck = await SubscriptionService.canUserBroadcast(userId, botId);
        
        if (!broadcastCheck.canBroadcast) {
          await ctx.reply(
            `❌ *Weekly Broadcast Limit Reached*\n\n` +
            `You have used ${broadcastCheck.currentCount}/${broadcastCheck.weeklyLimit} broadcasts this week.\n\n` +
            `*Freemium:* 3 broadcasts per week\n` +
            `*Premium:* Unlimited broadcasts\n\n` +
            `💎 Upgrade to Premium for unlimited broadcasts!\n\n` +
            `*Reset:* ${this.getNextResetDate()}`,
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('💎 Upgrade to Premium', 'premium_upgrade')],
                [Markup.button.callback('🔙 Dashboard', 'mini_dashboard')]
              ])
            }
          );
          return;
        }
        
        ctx.broadcastLimit = broadcastCheck;
        return next();
        
      } catch (error) {
        console.error('Broadcast limit check error:', error);
        return next();
      }
    };
  }

  // NEW METHOD: Check co-admin limit
  static checkCoAdminLimit() {
    return async (ctx, next) => {
      try {
        const userId = ctx.from.id;
        let botId = null;
        
        // Extract botId from context
        if (ctx.match && ctx.match[0]) {
          const match = ctx.match[0];
          if (match.includes('add_admin:')) {
            botId = match.split(':')[1];
          } else if (match.includes('admins:')) {
            // We might want to check when entering admin management
            botId = match.split(':')[1];
          }
        }
        
        // Try to get botId from session
        if (!botId) {
          const adminSessions = require('../handlers/adminHandler').adminSessions;
          const session = adminSessions.get(userId);
          botId = session?.botId;
        }
        
        if (!botId) {
          return next(); // No botId, can't check limit
        }
        
        const limitCheck = await SubscriptionService.canUserAddCoAdmin(userId, botId);
        
        // Store in context for use in handlers
        ctx.coAdminLimit = limitCheck;
        
        // If user is trying to add admin and limit reached, show error
        if (!limitCheck.canAdd && ctx.match && ctx.match[0].includes('add_admin:')) {
          await ctx.editMessageText(
            `❌ *Co-Admin Limit Reached*\n\n` +
            `*Your Tier:* ${limitCheck.tier === 'premium' ? '💎 Premium' : '🆓 Freemium'}\n` +
            `*Current Co-Admins:* ${limitCheck.currentCount}\n` +
            `*Limit:* ${limitCheck.limit === null ? 'Unlimited' : limitCheck.limit}\n\n` +
            `${limitCheck.reason}\n\n` +
            `💎 *Upgrade to Premium* for unlimited co-admins!`,
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('💎 Upgrade to Premium', 'premium_upgrade')],
                [Markup.button.callback('🔙 Back to Admins', `admins:${botId}`)]
              ])
            }
          );
          return;
        }
        
        return next();
        
      } catch (error) {
        console.error('Co-admin limit check error:', error);
        return next();
      }
    };
  }

  static getFeatureDescription(feature) {
    const descriptions = {
      'pin_messages': 'Pin start messages',
      'donation_system': 'Enable donation system',
      'remove_ads': 'Ad-free experience',
      'unlimited_broadcasts': 'Unlimited broadcasts',
      'advanced_analytics': 'Advanced analytics',
      'co_admins': 'Unlimited co-admins',
      'unlimited_co_admins': 'Unlimited co-admins'
    };
    return descriptions[feature] || 'Premium feature';
  }

  static getNextResetDate() {
    const now = new Date();
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + ((7 - now.getDay()) % 7 + 1) % 7);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday.toLocaleDateString();
  }

  // NEW METHOD: Check co-admin feature access
  static checkCoAdminAccess() {
    return async (ctx, next) => {
      try {
        const userId = ctx.from.id;
        
        // Check if this is a co-admin specific action
        const isAdminAction = ctx.match && (
          ctx.match[0].includes('add_admin:') ||
          ctx.match[0].includes('admins:') ||
          ctx.match[0].includes('remove_admin:')
        );
        
        if (!isAdminAction) {
          return next();
        }
        
        // Get user's subscription info
        const userFeatures = await SubscriptionService.getUserFeatures(userId);
        
        if (!userFeatures.features.co_admins.enabled) {
          await ctx.reply(
            `❌ *Co-Admin Feature Not Available*\n\n` +
            `Co-admin management requires premium subscription.\n\n` +
            `💎 *Upgrade to Premium* to unlock:\n` +
            `• Unlimited co-admins\n` +
            `• Team collaboration\n` +
            `• Shared bot management\n\n` +
            `*Price:* 3 BOM per month`,
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('💎 Upgrade to Premium', 'premium_upgrade')],
                [Markup.button.callback('🔙 Back', 'start')]
              ])
            }
          );
          return;
        }
        
        ctx.userFeatures = userFeatures;
        return next();
        
      } catch (error) {
        console.error('Check co-admin access error:', error);
        return next();
      }
    };
  }
}

module.exports = SubscriptionMiddleware;