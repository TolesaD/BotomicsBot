// src/services/subscriptionService.js - COMPLETE PRODUCTION VERSION
const { UserSubscription, User, Wallet, WalletTransaction, BroadcastHistory, Bot, Admin } = require('../models');
const WalletService = require('./walletService');
const Sequelize = require('sequelize');

class SubscriptionService {
    
    // Get user's subscription tier
    static async getSubscriptionTier(userId) {
        try {
            // Check for active premium subscription
            const activeSubscription = await UserSubscription.findOne({
                where: {
                    user_id: userId,
                    status: 'active',
                    current_period_end: {
                        [Sequelize.Op.gt]: new Date()
                    }
                }
            });
            
            if (activeSubscription && activeSubscription.tier === 'premium') {
                return 'premium';
            }
            
            return 'freemium';
        } catch (error) {
            console.error('Get subscription tier error:', error);
            return 'freemium'; // Default to freemium on error
        }
    }

    // Check if user can create a new bot
    static async canUserCreateBot(userId) {
      try {
        // Get user's subscription tier
        const tier = await this.getSubscriptionTier(userId);
        
        // Check if user is banned
        const user = await User.findOne({ where: { telegram_id: userId } });
        if (user && user.is_banned) {
          return {
            canCreate: false,
            currentCount: 0,
            botLimit: 0,
            remaining: 0,
            reason: 'User is banned'
          };
        }
        
        // Count user's existing active bots
        const botCount = await Bot.count({ 
          where: { 
            owner_id: userId,
            is_active: true 
          } 
        });
        
        // Set limits based on subscription tier
        let botLimit;
        if (tier === 'premium') {
          botLimit = 50; // Premium users get 50 bots
        } else {
          botLimit = 5; // Freemium users get 5 bots
        }
        
        const canCreate = botCount < botLimit;
        const remaining = Math.max(0, botLimit - botCount);
        
        return {
          canCreate,
          currentCount: botCount,
          botLimit,
          remaining,
          tier
        };
        
      } catch (error) {
        console.error('canUserCreateBot error:', error);
        // Default to freemium limits on error
        return {
          canCreate: false,
          currentCount: 0,
          botLimit: 5,
          remaining: 0,
          reason: 'Error checking subscription'
        };
      }
    }
    
    // NEW METHOD: Check if user can add co-admins
    static async canUserAddCoAdmin(userId, botId) {
      try {
        // Get user's subscription tier
        const tier = await this.getSubscriptionTier(userId);
        
        // Premium users have no limit
        if (tier === 'premium') {
          return {
            canAdd: true,
            currentCount: 0,
            limit: null, // null means unlimited
            tier: 'premium',
            reason: ''
          };
        }
        
        // Freemium users: count existing co-admins (excluding owner)
        const bot = await Bot.findByPk(botId);
        if (!bot) {
          return {
            canAdd: false,
            currentCount: 0,
            limit: 1,
            tier: 'freemium',
            reason: 'Bot not found'
          };
        }
        
        const coAdminCount = await Admin.count({
          where: {
            bot_id: botId,
            admin_user_id: { [Sequelize.Op.ne]: bot.owner_id }
          }
        });
        
        // Freemium users can only have 1 co-admin
        const canAdd = coAdminCount < 1;
        
        return {
          canAdd: canAdd,
          currentCount: coAdminCount,
          limit: 1,
          tier: 'freemium',
          reason: canAdd ? '' : 'Freemium users are limited to 1 co-admin'
        };
        
      } catch (error) {
        console.error('canUserAddCoAdmin error:', error);
        return {
          canAdd: false,
          currentCount: 0,
          limit: 1,
          tier: 'freemium',
          reason: 'Error checking co-admin limit'
        };
      }
    }
    
    // Get user subscription details
    static async getUserSubscription(userId) {
        try {
            const subscription = await UserSubscription.findOne({
                where: { user_id: userId },
                order: [['created_at', 'DESC']]
            });
            
            return subscription;
        } catch (error) {
            console.error('Get user subscription error:', error);
            return null;
        }
    }
    
    // Upgrade user to premium
    static async upgradeToPremium(userId) {
        const transaction = await UserSubscription.sequelize.transaction();
        
        try {
            // Check wallet balance (3 BOM for monthly)
            const wallet = await Wallet.findOne({ 
                where: { user_id: userId },
                transaction
            });
            
            if (!wallet) {
                throw new Error('Wallet not found. Please create a wallet first.');
            }
            
            if (parseFloat(wallet.balance) < 3) {
                throw new Error('Insufficient balance. Need 3 BOM for premium subscription.');
            }
            
            // Check if already has active premium
            const existingActive = await UserSubscription.findOne({
                where: {
                    user_id: userId,
                    status: 'active',
                    current_period_end: {
                        [Sequelize.Op.gt]: new Date()
                    }
                },
                transaction
            });
            
            if (existingActive && existingActive.tier === 'premium') {
                throw new Error('You already have an active premium subscription.');
            }
            
            // Deduct 3 BOM from wallet
            const newBalance = parseFloat(wallet.balance) - 3;
            await wallet.update({
                balance: newBalance
            }, { transaction });
            
            // Calculate dates
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            
            // Cancel any existing subscriptions
            await UserSubscription.update(
                { status: 'cancelled', cancelled_at: now },
                {
                    where: {
                        user_id: userId,
                        status: 'active'
                    },
                    transaction
                }
            );
            
            // Create new subscription
            const subscription = await UserSubscription.create({
                user_id: userId,
                tier: 'premium',
                status: 'active',
                monthly_price: 3.00,
                currency: 'BOM',
                current_period_start: now,
                current_period_end: periodEnd,
                auto_renew: true
            }, { transaction });
            
            // Update user record
            await User.update(
                {
                    premium_status: 'premium',
                    premium_expires_at: periodEnd,
                    premium_started_at: now
                },
                {
                    where: { telegram_id: userId },
                    transaction
                }
            );
            
            // Create subscription transaction
            await WalletTransaction.create({
                wallet_id: wallet.id,
                type: 'subscription',
                amount: -3,
                currency: 'BOM',
                description: 'Monthly premium subscription',
                status: 'completed',
                metadata: {
                    subscription_id: subscription.id,
                    period: 'monthly',
                    period_start: now.toISOString(),
                    period_end: periodEnd.toISOString()
                }
            }, { transaction });
            
            await transaction.commit();
            
            return subscription;
            
        } catch (error) {
            await transaction.rollback();
            console.error('Upgrade to premium error:', error);
            throw error;
        }
    }
    
    // Cancel subscription
    static async cancelSubscription(userId) {
        const transaction = await UserSubscription.sequelize.transaction();
        
        try {
            const activeSubscription = await UserSubscription.findOne({
                where: {
                    user_id: userId,
                    status: 'active'
                },
                transaction
            });
            
            if (!activeSubscription) {
                throw new Error('No active subscription found');
            }
            
            // Update subscription
            await activeSubscription.update({
                status: 'cancelled',
                auto_renew: false,
                cancelled_at: new Date()
            }, { transaction });
            
            // Update user record (keep premium until period end)
            await User.update(
                { premium_status: 'cancelled' },
                {
                    where: { telegram_id: userId },
                    transaction
                }
            );
            
            await transaction.commit();
            
            return activeSubscription;
            
        } catch (error) {
            await transaction.rollback();
            console.error('Cancel subscription error:', error);
            throw error;
        }
    }
    
    // Process auto-renewals
    static async processAutoRenewals() {
        try {
            console.log('🔄 Processing subscription auto-renewals...');
            
            const today = new Date();
            const subscriptions = await UserSubscription.findAll({
                where: {
                    status: 'active',
                    auto_renew: true,
                    current_period_end: {
                        [Sequelize.Op.lt]: today
                    }
                }
            });
            
            let renewedCount = 0;
            let failedCount = 0;
            
            for (const subscription of subscriptions) {
                try {
                    await this.renewSubscription(subscription);
                    renewedCount++;
                } catch (error) {
                    console.error(`Failed to renew subscription ${subscription.id}:`, error.message);
                    
                    // Mark subscription as expired
                    await subscription.update({
                        status: 'expired',
                        auto_renew: false
                    });
                    
                    // Update user to freemium
                    await User.update(
                        { premium_status: 'freemium' },
                        { where: { telegram_id: subscription.user_id } }
                    );
                    
                    failedCount++;
                }
            }
            
            console.log(`✅ Auto-renewals completed. Renewed: ${renewedCount}, Failed: ${failedCount}`);
            
            return { renewedCount, failedCount };
            
        } catch (error) {
            console.error('Process auto-renewals error:', error);
            throw error;
        }
    }
    
    // Renew a single subscription
    static async renewSubscription(subscription) {
        const transaction = await UserSubscription.sequelize.transaction();
        
        try {
            const wallet = await Wallet.findOne({ 
                where: { user_id: subscription.user_id },
                transaction
            });
            
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            if (parseFloat(wallet.balance) < subscription.monthly_price) {
                throw new Error('Insufficient balance for renewal');
            }
            
            // Deduct from wallet
            const newBalance = parseFloat(wallet.balance) - subscription.monthly_price;
            await wallet.update({
                balance: newBalance
            }, { transaction });
            
            // Calculate new period
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            
            // Update subscription
            await subscription.update({
                current_period_start: now,
                current_period_end: periodEnd
            }, { transaction });
            
            // Update user record
            await User.update(
                {
                    premium_status: 'premium',
                    premium_expires_at: periodEnd
                },
                {
                    where: { telegram_id: subscription.user_id },
                    transaction
                }
            );
            
            // Create renewal transaction
            await WalletTransaction.create({
                wallet_id: wallet.id,
                type: 'subscription',
                amount: -subscription.monthly_price,
                currency: subscription.currency,
                description: 'Monthly premium subscription renewal',
                status: 'completed',
                metadata: {
                    subscription_id: subscription.id,
                    renewal: true,
                    period_start: now.toISOString(),
                    period_end: periodEnd.toISOString()
                }
            }, { transaction });
            
            await transaction.commit();
            
            return subscription;
            
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
    
    // Get subscription statistics (admin)
    static async getSubscriptionStats() {
        try {
            const [
                totalSubscriptions,
                activeSubscriptions,
                cancelledSubscriptions,
                totalUsers,
                premiumUsers,
                totalRevenue
            ] = await Promise.all([
                UserSubscription.count(),
                UserSubscription.count({
                    where: {
                        status: 'active',
                        current_period_end: {
                            [Sequelize.Op.gt]: new Date()
                        }
                    }
                }),
                UserSubscription.count({ where: { status: 'cancelled' } }),
                User.count(),
                User.count({ where: { premium_status: 'premium' } }),
                WalletTransaction.sum('amount', {
                    where: {
                        type: 'subscription',
                        status: 'completed'
                    }
                })
            ]);
            
            const freemiumUsers = totalUsers - premiumUsers;
            const monthlyRevenue = Math.abs(totalRevenue || 0) / (totalSubscriptions || 1) * activeSubscriptions;
            const estimatedAnnualRevenue = monthlyRevenue * 12;
            const conversionRate = totalUsers > 0 ? (premiumUsers / totalUsers) * 100 : 0;
            
            return {
                totalSubscriptions,
                activeSubscriptions,
                cancelledSubscriptions,
                freemiumUsers,
                premiumUsers,
                monthlyRevenue,
                estimatedAnnualRevenue,
                conversionRate: parseFloat(conversionRate.toFixed(1))
            };
        } catch (error) {
            console.error('Get subscription stats error:', error);
            throw error;
        }
    }
    
    // Force update subscription (admin only)
    static async forceUpdateSubscription(userId, tier, adminId, reason) {
        const transaction = await UserSubscription.sequelize.transaction();
        
        try {
            const now = new Date();
            let periodEnd;
            
            if (tier === 'premium') {
                periodEnd = new Date(now);
                periodEnd.setMonth(periodEnd.getMonth() + 1);
                
                // Cancel any existing subscriptions
                await UserSubscription.update(
                    { status: 'cancelled', cancelled_at: now },
                    {
                        where: {
                            user_id: userId,
                            status: 'active'
                        },
                        transaction
                    }
                );
                
                // Create new subscription
                await UserSubscription.create({
                    user_id: userId,
                    tier: 'premium',
                    status: 'active',
                    monthly_price: 3.00,
                    currency: 'BOM',
                    current_period_start: now,
                    current_period_end: periodEnd,
                    auto_renew: false,
                    metadata: {
                        admin_granted: true,
                        admin_id: adminId,
                        reason: reason
                    }
                }, { transaction });
                
                // Update user
                await User.update(
                    {
                        premium_status: 'premium',
                        premium_expires_at: periodEnd,
                        premium_started_at: now
                    },
                    {
                        where: { telegram_id: userId },
                        transaction
                    }
                );
                
            } else {
                // Downgrade to freemium
                await UserSubscription.update(
                    {
                        status: 'cancelled',
                        cancelled_at: now,
                        auto_renew: false
                    },
                    {
                        where: {
                            user_id: userId,
                            status: 'active'
                        },
                        transaction
                    }
                );
                
                await User.update(
                    { premium_status: 'freemium' },
                    {
                        where: { telegram_id: userId },
                        transaction
                    }
                );
            }
            
            await transaction.commit();
            
            return {
                success: true,
                userId: userId,
                tier: tier,
                adminId: adminId,
                reason: reason,
                timestamp: now.toISOString()
            };
            
        } catch (error) {
            await transaction.rollback();
            console.error('Force update subscription error:', error);
            throw error;
        }
    }

    // Get weekly broadcast count - FIXED: Use sent_at instead of created_at
    static async getWeeklyBroadcastCount(userId, botId) {
        try {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            
            const count = await BroadcastHistory.count({
                where: {
                    bot_id: botId,
                    sent_by: userId,
                    sent_at: {
                        [Sequelize.Op.gte]: oneWeekAgo
                    }
                }
            });
            
            return count;
        } catch (error) {
            console.error('Get weekly broadcast count error:', error);
            return 0;
        }
    }

    // Check if user can broadcast - FIXED: Use getWeeklyBroadcastCount
    static async canUserBroadcast(userId, botId) {
        try {
            const subscriptionTier = await this.getSubscriptionTier(userId);
            const weeklyLimit = subscriptionTier === 'premium' ? 999999 : 3; // Unlimited for premium
            
            const currentCount = await this.getWeeklyBroadcastCount(userId, botId);
            const canBroadcast = currentCount < weeklyLimit;
            const remaining = weeklyLimit - currentCount;
            
            return {
                canBroadcast: canBroadcast,
                currentCount: currentCount,
                weeklyLimit: weeklyLimit,
                remaining: remaining > 0 ? remaining : 0,
                isPremium: subscriptionTier === 'premium'
            };
        } catch (error) {
            console.error('Can user broadcast error:', error);
            // Default to allowing broadcast on error
            return {
                canBroadcast: true,
                currentCount: 0,
                weeklyLimit: 3,
                remaining: 3,
                isPremium: false
            };
        }
    }

    // Check feature access
    static async checkFeatureAccess(userId, feature) {
        try {
            const tier = await this.getSubscriptionTier(userId);
            
            if (tier === 'premium') {
                return true; // Premium users have access to all features
            }
            
            // Freemium feature limitations
            const freemiumLimits = {
                'pin_messages': false,
                'donation_system': false,
                'remove_ads': false,
                'unlimited_broadcasts': false,
                'advanced_analytics': false,
                'unlimited_co_admins': false,
                'co_admins': false
            };
            
            // Check if feature requires premium
            if (feature === 'co_admins') {
                return false; // Freemium users have limited co-admins
            }
            
            return freemiumLimits[feature] || false;
        } catch (error) {
            console.error('Check feature access error:', error);
            return false;
        }
    }

    // Get user's feature status
    static async getUserFeatures(userId) {
        try {
            const tier = await this.getSubscriptionTier(userId);
            const isPremium = tier === 'premium';
            
            // Get co-admin limit info for specific user
            const coAdminInfo = {
                enabled: true, // Everyone gets co-admins
                limit: isPremium ? 'Unlimited' : '1 co-admin max',
                unlimited: isPremium
            };
            
            return {
                tier: tier,
                isPremium: isPremium,
                features: {
                    pin_messages: isPremium,
                    donation_system: isPremium,
                    remove_ads: isPremium,
                    unlimited_broadcasts: isPremium,
                    advanced_analytics: isPremium,
                    co_admins: coAdminInfo,
                    basic_broadcasts: true, // Everyone gets basic broadcasts
                    referral_program: true,
                    channel_management: true
                },
                limits: {
                    weekly_broadcasts: isPremium ? 'Unlimited' : '3 per week',
                    max_bots: isPremium ? '50 bots' : '5 bots',
                    max_co_admins: isPremium ? 'Unlimited' : '1 co-admin',
                    storage: isPremium ? 'Unlimited' : '100MB'
                }
            };
        } catch (error) {
            console.error('Get user features error:', error);
            return {
                tier: 'freemium',
                isPremium: false,
                features: {
                    pin_messages: false,
                    donation_system: false,
                    remove_ads: false,
                    unlimited_broadcasts: false,
                    advanced_analytics: false,
                    co_admins: {
                        enabled: true,
                        limit: '1 co-admin max',
                        unlimited: false
                    },
                    basic_broadcasts: true,
                    referral_program: true,
                    channel_management: true
                },
                limits: {
                    weekly_broadcasts: '3 per week',
                    max_bots: '5 bots',
                    max_co_admins: '1 co-admin',
                    storage: '100MB'
                }
            };
        }
    }

    // Get subscription expiration info
    static async getSubscriptionExpiration(userId) {
        try {
            const subscription = await UserSubscription.findOne({
                where: {
                    user_id: userId,
                    status: 'active',
                    current_period_end: {
                        [Sequelize.Op.gt]: new Date()
                    }
                }
            });
            
            if (!subscription) {
                return {
                    hasActive: false,
                    expiresIn: null,
                    expiresAt: null,
                    autoRenew: false
                };
            }
            
            const now = new Date();
            const expiresAt = subscription.current_period_end;
            const expiresIn = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)); // Days
            
            return {
                hasActive: true,
                tier: subscription.tier,
                expiresIn: expiresIn,
                expiresAt: expiresAt,
                autoRenew: subscription.auto_renew,
                monthlyPrice: subscription.monthly_price,
                currency: subscription.currency
            };
        } catch (error) {
            console.error('Get subscription expiration error:', error);
            return {
                hasActive: false,
                expiresIn: null,
                expiresAt: null,
                autoRenew: false
            };
        }
    }

    // Update subscription auto-renew setting
    static async updateAutoRenew(userId, autoRenew) {
        try {
            const subscription = await UserSubscription.findOne({
                where: {
                    user_id: userId,
                    status: 'active'
                }
            });
            
            if (!subscription) {
                throw new Error('No active subscription found');
            }
            
            await subscription.update({
                auto_renew: autoRenew
            });
            
            return {
                success: true,
                autoRenew: autoRenew,
                updatedAt: new Date()
            };
        } catch (error) {
            console.error('Update auto-renew error:', error);
            throw error;
        }
    }

    // Get all active subscriptions (admin)
    static async getAllActiveSubscriptions() {
        try {
            const subscriptions = await UserSubscription.findAll({
                where: {
                    status: 'active',
                    current_period_end: {
                        [Sequelize.Op.gt]: new Date()
                    }
                },
                include: [{
                    model: User,
                    attributes: ['telegram_id', 'username', 'first_name', 'premium_status']
                }],
                order: [['current_period_end', 'ASC']]
            });
            
            return subscriptions.map(sub => ({
                id: sub.id,
                userId: sub.user_id,
                tier: sub.tier,
                username: sub.User?.username || `User#${sub.user_id}`,
                firstName: sub.User?.first_name || 'Unknown',
                monthlyPrice: sub.monthly_price,
                currency: sub.currency,
                periodStart: sub.current_period_start,
                periodEnd: sub.current_period_end,
                autoRenew: sub.auto_renew,
                daysRemaining: Math.ceil((sub.current_period_end - new Date()) / (1000 * 60 * 60 * 24))
            }));
        } catch (error) {
            console.error('Get all active subscriptions error:', error);
            return [];
        }
    }

    // Process subscription webhook (for future payment integrations)
    static async processWebhook(webhookData) {
        try {
            // This is a placeholder for future payment gateway integration
            console.log('Webhook received:', webhookData);
            
            return {
                processed: true,
                message: 'Webhook processed successfully',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Process webhook error:', error);
            return {
                processed: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = SubscriptionService;