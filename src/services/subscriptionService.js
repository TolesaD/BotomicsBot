const { UserSubscription, User, WalletService, Bot, BroadcastHistory } = require('../models');
const { Op } = require('sequelize');

class SubscriptionService {
  async getUserSubscription(userId) {
    return await UserSubscription.findOne({
      where: { 
        user_id: userId,
        status: 'active'
      },
      order: [['created_at', 'DESC']]
    });
  }
  
  async getSubscriptionTier(userId) {
    const subscription = await this.getUserSubscription(userId);
    
    if (subscription && subscription.tier === 'premium') {
      // Check if subscription is still valid
      if (new Date() < new Date(subscription.current_period_end)) {
        return 'premium';
      } else {
        // Subscription expired, downgrade to freemium
        await subscription.update({ status: 'expired' });
        await User.update(
          { premium_status: 'freemium' },
          { where: { telegram_id: userId } }
        );
        return 'freemium';
      }
    }
    
    return 'freemium';
  }
  
  async upgradeToPremium(userId) {
    const currentTier = await this.getSubscriptionTier(userId);
    
    if (currentTier === 'premium') {
      throw new Error('User is already on premium tier.');
    }
    
    // Check wallet balance (5 BOM per month)
    const walletBalance = await WalletService.getBalance(userId);
    if (walletBalance.balance < 5) {
      throw new Error('Insufficient BOM balance. Need 5 BOM for premium subscription.');
    }
    
    // Create subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    
    const subscription = await UserSubscription.create({
      user_id: userId,
      tier: 'premium',
      status: 'active',
      monthly_price: 5.00,
      currency: 'BOM',
      current_period_start: now,
      current_period_end: periodEnd,
      auto_renew: true
    });
    
    // Deduct from wallet
    await WalletService.withdraw(
      userId, 
      5, 
      'Monthly premium subscription',
      { subscription_id: subscription.id }
    );
    
    // Update user record
    await User.update(
      { 
        premium_status: 'premium',
        premium_expires_at: periodEnd
      },
      { where: { telegram_id: userId } }
    );
    
    console.log(`🎫 User ${userId} upgraded to premium subscription`);
    
    return subscription;
  }
  
  async cancelSubscription(userId) {
    const subscription = await this.getUserSubscription(userId);
    
    if (!subscription || subscription.tier !== 'premium') {
      throw new Error('No active premium subscription found.');
    }
    
    await subscription.update({
      status: 'cancelled',
      auto_renew: false
    });
    
    await User.update(
      { premium_status: 'freemium' },
      { where: { telegram_id: userId } }
    );
    
    console.log(`❌ User ${userId} cancelled premium subscription`);
    
    return subscription;
  }
  
  async checkFeatureAccess(userId, feature) {
    const tier = await this.getSubscriptionTier(userId);
    
    const featureLimits = {
      bot_creation: {
        freemium: 5,
        premium: 9999
      },
      broadcasts_per_week: {
        freemium: 3,
        premium: 9999
      },
      co_admins: {
        freemium: 1,
        premium: 9999
      },
      force_join_channels: {
        freemium: 1,
        premium: 9999
      },
      donation_system: {
        freemium: false,
        premium: true
      },
      pin_messages: {
        freemium: false,
        premium: true
      },
      remove_ads: {
        freemium: false,
        premium: true
      }
    };
    
    return featureLimits[feature] ? featureLimits[feature][tier] : null;
  }

  // NEW: Check weekly broadcast count
  async getWeeklyBroadcastCount(userId, botId) {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const broadcastCount = await BroadcastHistory.count({
      where: {
        bot_id: botId,
        sent_by: userId,
        created_at: {
          [Op.gte]: oneWeekAgo
        }
      }
    });
    
    return broadcastCount;
  }

  // NEW: Check if user can broadcast this week
  async canUserBroadcast(userId, botId) {
    const weeklyLimit = await this.checkFeatureAccess(userId, 'broadcasts_per_week');
    const currentCount = await this.getWeeklyBroadcastCount(userId, botId);
    
    return {
      canBroadcast: currentCount < weeklyLimit,
      currentCount,
      weeklyLimit,
      remaining: weeklyLimit - currentCount
    };
  }

  // NEW: Get user's bot count
  async getUserBotCount(userId) {
    return await Bot.count({ where: { owner_id: userId } });
  }

  // NEW: Check if user can create more bots
  async canUserCreateBot(userId) {
    const botLimit = await this.checkFeatureAccess(userId, 'bot_creation');
    const currentCount = await this.getUserBotCount(userId);
    
    return {
      canCreate: currentCount < botLimit,
      currentCount,
      botLimit,
      remaining: botLimit - currentCount
    };
  }
  
  async processAutoRenewals() {
    const now = new Date();
    const expiringSubscriptions = await UserSubscription.findAll({
      where: {
        status: 'active',
        auto_renew: true,
        current_period_end: {
          [Op.lt]: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // Within next 7 days
        }
      }
    });
    
    const results = {
      renewed: 0,
      failed: 0,
      errors: []
    };
    
    for (const subscription of expiringSubscriptions) {
      try {
        const walletBalance = await WalletService.getBalance(subscription.user_id);
        
        if (walletBalance.balance >= subscription.monthly_price) {
          // Renew subscription
          const newPeriodEnd = new Date(subscription.current_period_end);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
          
          await subscription.update({
            current_period_start: subscription.current_period_end,
            current_period_end: newPeriodEnd
          });
          
          await WalletService.withdraw(
            subscription.user_id,
            subscription.monthly_price,
            'Auto-renew premium subscription',
            { subscription_id: subscription.id }
          );
          
          await User.update(
            { premium_expires_at: newPeriodEnd },
            { where: { telegram_id: subscription.user_id } }
          );
          
          results.renewed++;
        } else {
          // Insufficient funds, cancel subscription
          await this.cancelSubscription(subscription.user_id);
          results.failed++;
        }
      } catch (error) {
        results.errors.push({
          subscription_id: subscription.id,
          error: error.message
        });
        results.failed++;
      }
    }
    
    return results;
  }
}

module.exports = new SubscriptionService();