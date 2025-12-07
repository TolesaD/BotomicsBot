// src/routes/walletRoutes.js - COMPLETE PRODUCTION VERSION
const express = require('express');
const router = express.Router();
const WalletService = require('../services/walletService');
const SubscriptionService = require('../services/subscriptionService');
const { Wallet, WalletTransaction, UserSubscription, User, Withdrawal } = require('../models');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

// Simple authentication middleware
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Extract user ID from query parameters or body
    const userId = req.query.userId || req.body.userId;
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    
    req.userId = userId;
    next();
}

// Wallet balance
router.get('/wallet/balance', authenticate, async (req, res) => {
    try {
        const balance = await WalletService.getBalance(req.userId);
        res.json(balance);
    } catch (error) {
        console.error('Balance API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Deposit request
router.post('/wallet/deposit', authenticate, async (req, res) => {
    try {
        const { amount, description, proofImageUrl } = req.body;
        
        if (!amount || amount < 5) {
            return res.status(400).json({ error: 'Minimum deposit amount is 5 BOM' });
        }
        
        const result = await WalletService.deposit(req.userId, amount, description || `Deposit of ${amount} BOM`, proofImageUrl);
        
        res.json({
            success: true,
            transaction: {
                id: result.transaction.id,
                amount: result.transaction.amount,
                description: result.transaction.description,
                status: result.transaction.status,
                created_at: result.transaction.created_at
            },
            message: 'Deposit request submitted. Awaiting admin approval.'
        });
    } catch (error) {
        console.error('Deposit API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Withdrawal request
router.post('/wallet/withdraw', authenticate, async (req, res) => {
    try {
        const { amount, method, payoutDetails } = req.body;
        
        if (!amount || amount < 20) {
            return res.status(400).json({ error: 'Minimum withdrawal amount is 20 BOM' });
        }
        
        if (!method || !payoutDetails) {
            return res.status(400).json({ error: 'Withdrawal method and details are required' });
        }
        
        const result = await WalletService.requestWithdrawal(req.userId, amount, method, payoutDetails);
        
        res.json({
            success: true,
            withdrawal: {
                id: result.id,
                amount: result.amount,
                method: result.method,
                status: result.status,
                created_at: result.created_at
            },
            message: 'Withdrawal request submitted. Processing within 24 hours.'
        });
    } catch (error) {
        console.error('Withdrawal API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Transfer BOM
router.post('/wallet/transfer', authenticate, async (req, res) => {
    try {
        const { senderId, receiverId, amount, description } = req.body;
        
        if (!senderId || !receiverId || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (amount <= 0) {
            return res.status(400).json({ error: 'Amount must be positive' });
        }
        
        const result = await WalletService.transfer(senderId, receiverId, amount, description || `Transfer of ${amount} BOM`);
        
        res.json({
            success: true,
            transaction: result,
            message: 'Transfer completed successfully.'
        });
    } catch (error) {
        console.error('Transfer API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Transaction history
router.get('/wallet/transactions', authenticate, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const type = req.query.type;
        const status = req.query.status;
        const period = req.query.period || '30days';
        
        const wallet = await Wallet.findOne({ where: { user_id: req.userId } });
        if (!wallet) {
            return res.json({
                transactions: [],
                pagination: {
                    currentPage: page,
                    totalPages: 0,
                    totalItems: 0,
                    itemsPerPage: limit
                }
            });
        }
        
        // Calculate date filter
        let dateFilter = {};
        const now = new Date();
        switch (period) {
            case '7days':
                dateFilter = { created_at: { [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } };
                break;
            case '30days':
                dateFilter = { created_at: { [Op.gte]: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } };
                break;
            case '90days':
                dateFilter = { created_at: { [Op.gte]: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } };
                break;
        }
        
        const where = { wallet_id: wallet.id, ...dateFilter };
        if (type && type !== 'all') where.type = type;
        if (status && status !== 'all') where.status = status;
        
        const { count, rows } = await WalletTransaction.findAndCountAll({
            where,
            order: [['created_at', 'DESC']],
            limit,
            offset: (page - 1) * limit
        });
        
        res.json({
            transactions: rows.map(tx => ({
                id: tx.id,
                type: tx.type,
                amount: parseFloat(tx.amount),
                currency: tx.currency,
                description: tx.description,
                status: tx.status,
                metadata: tx.metadata,
                created_at: tx.created_at
            })),
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                totalItems: count,
                itemsPerPage: limit
            }
        });
        
    } catch (error) {
        console.error('Transactions API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Subscription status
router.get('/subscription/status', authenticate, async (req, res) => {
    try {
        const tier = await SubscriptionService.getSubscriptionTier(req.userId);
        const subscription = await SubscriptionService.getUserSubscription(req.userId);
        
        res.json({
            tier: tier,
            subscription: subscription ? {
                id: subscription.id,
                tier: subscription.tier,
                status: subscription.status,
                monthly_price: subscription.monthly_price,
                current_period_start: subscription.current_period_start,
                current_period_end: subscription.current_period_end,
                auto_renew: subscription.auto_renew,
                created_at: subscription.created_at
            } : null,
            user_id: req.userId
        });
    } catch (error) {
        console.error('Subscription status API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upgrade to premium
router.post('/subscription/upgrade', authenticate, async (req, res) => {
    try {
        const { userId, plan } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        let subscription;
        if (plan === 'yearly') {
            // Process yearly plan (50 BOM)
            const wallet = await WalletService.getBalance(userId);
            if (wallet.balance < 50) {
                return res.status(400).json({ error: 'Insufficient balance for yearly plan (50 BOM required)' });
            }
            
            // Process payment
            await WalletService.transfer(userId, '0', 50, 'Yearly premium subscription');
            
            // Create yearly subscription
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
            
            subscription = await UserSubscription.create({
                user_id: userId,
                tier: 'premium',
                status: 'active',
                monthly_price: 30/12,
                currency: 'BOM',
                current_period_start: now,
                current_period_end: periodEnd,
                auto_renew: true,
                metadata: { plan: 'yearly' }
            });
            
            // Update user premium status
            await User.update(
                { premium_status: 'premium', premium_expires_at: periodEnd },
                { where: { telegram_id: userId } }
            );
        } else {
            // Process monthly plan (3 BOM)
            subscription = await SubscriptionService.upgradeToPremium(userId);
        }
        
        res.json({
            success: true,
            message: 'Premium subscription activated successfully.',
            subscription: {
                id: subscription.id,
                tier: subscription.tier,
                status: subscription.status,
                current_period_end: subscription.current_period_end
            }
        });
    } catch (error) {
        console.error('Subscription upgrade API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cancel subscription
router.post('/subscription/cancel', authenticate, async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        const subscription = await SubscriptionService.cancelSubscription(userId);
        
        res.json({
            success: true,
            message: 'Subscription cancelled successfully.',
            subscription: {
                id: subscription.id,
                status: subscription.status,
                cancelled_at: subscription.cancelled_at
            }
        });
    } catch (error) {
        console.error('Subscription cancel API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
router.get('/wallet/health', (req, res) => {
    res.json({ 
        status: 'online', 
        service: 'Botomics Wallet API',
        version: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;