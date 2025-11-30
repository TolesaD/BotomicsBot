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
            `*Price:* 5 BOM per month ($5.00)`,
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
            `*Premium:* Unlimited bots\n\n` +
            `💎 Upgrade to Premium for unlimited bots!`,
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

  static getFeatureDescription(feature) {
    const descriptions = {
      bot_creation: 'Unlimited bot creation',
      broadcasts_per_week: 'Unlimited broadcasts', 
      co_admins: 'Unlimited co-admins',
      force_join_channels: 'Unlimited force-join channels',
      donation_system: 'Enable donation system',
      pin_messages: 'Pin start messages',
      remove_ads: 'Ad-free experience'
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
}

module.exports = SubscriptionMiddleware;