// src/services/walletService.js - COMPLETE PRODUCTION VERSION
const { Wallet, WalletTransaction, User, Withdrawal, UserSubscription } = require('../models');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

class WalletService {
    
    // Get wallet balance for user
    static async getBalance(userId) {
        try {
            let wallet = await Wallet.findOne({ where: { user_id: userId } });
            
            if (!wallet) {
                // Create wallet if it doesn't exist
                wallet = await Wallet.create({
                    user_id: userId,
                    balance: 0.00,
                    currency: 'BOM',
                    is_frozen: false
                });
            }
            
            return {
                userId: userId,
                balance: parseFloat(wallet.balance),
                currency: wallet.currency,
                isFrozen: wallet.is_frozen,
                freezeReason: wallet.freeze_reason,
                walletAddress: `BOTOMICS_${userId}`,
                createdAt: wallet.created_at
            };
        } catch (error) {
            console.error('Get balance error:', error);
            throw new Error('Failed to get wallet balance');
        }
    }
    
    // Process deposit request
    static async deposit(userId, amount, description, proofImageUrl) {
        const transaction = await WalletTransaction.sequelize.transaction();
        
        try {
            let wallet = await Wallet.findOne({ 
                where: { user_id: userId },
                transaction
            });
            
            if (!wallet) {
                wallet = await Wallet.create({
                    user_id: userId,
                    balance: 0.00,
                    currency: 'BOM',
                    is_frozen: false
                }, { transaction });
            }
            
            if (wallet.is_frozen) {
                throw new Error('Wallet is frozen. Cannot process deposit.');
            }
            
            // Create pending deposit transaction
            const depositTransaction = await WalletTransaction.create({
                wallet_id: wallet.id,
                type: 'deposit',
                amount: amount,
                currency: 'BOM',
                description: description,
                status: 'pending',
                metadata: {
                    proof_image: proofImageUrl,
                    approved_by: null,
                    approved_at: null
                }
            }, { transaction });
            
            await transaction.commit();
            
            return {
                success: true,
                transaction: depositTransaction,
                walletId: wallet.id
            };
            
        } catch (error) {
            await transaction.rollback();
            console.error('Deposit error:', error);
            throw error;
        }
    }
    
    // Confirm deposit (admin only)
    static async confirmDeposit(transactionId, adminId) {
        const transaction = await WalletTransaction.sequelize.transaction();
        
        try {
            const depositTransaction = await WalletTransaction.findOne({
                where: { 
                    id: transactionId,
                    type: 'deposit',
                    status: 'pending'
                },
                include: [{
                    model: Wallet,
                    as: 'Wallet'
                }],
                transaction
            });
            
            if (!depositTransaction) {
                throw new Error('Pending deposit transaction not found');
            }
            
            // Update wallet balance
            const newBalance = parseFloat(depositTransaction.Wallet.balance) + parseFloat(depositTransaction.amount);
            await depositTransaction.Wallet.update({
                balance: newBalance
            }, { transaction });
            
            // Update transaction status
            await depositTransaction.update({
                status: 'completed',
                metadata: {
                    ...depositTransaction.metadata,
                    approved_by: adminId,
                    approved_at: new Date()
                }
            }, { transaction });
            
            // Create system transaction for record
            await WalletTransaction.create({
                wallet_id: depositTransaction.wallet_id,
                type: 'admin_adjustment',
                amount: depositTransaction.amount,
                currency: 'BOM',
                description: `Deposit approved by admin ${adminId}`,
                status: 'completed',
                metadata: {
                    original_transaction: transactionId,
                    admin_id: adminId
                }
            }, { transaction });
            
            await transaction.commit();
            
            return {
                success: true,
                transaction: depositTransaction,
                newBalance: newBalance
            };
            
        } catch (error) {
            await transaction.rollback();
            console.error('Confirm deposit error:', error);
            throw error;
        }
    }
    
    // Request withdrawal
    static async requestWithdrawal(userId, amount, method, payoutDetails) {
        const transaction = await WalletTransaction.sequelize.transaction();
        
        try {
            const wallet = await Wallet.findOne({ 
                where: { user_id: userId },
                transaction
            });
            
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            if (wallet.is_frozen) {
                throw new Error('Wallet is frozen. Cannot process withdrawal.');
            }
            
            if (parseFloat(wallet.balance) < parseFloat(amount)) {
                throw new Error('Insufficient balance');
            }
            
            // Minimum withdrawal check
            if (amount < 20) {
                throw new Error('Minimum withdrawal amount is 20 BOM');
            }
            
            // Deduct from wallet
            const newBalance = parseFloat(wallet.balance) - parseFloat(amount);
            await wallet.update({
                balance: newBalance
            }, { transaction });
            
            // Create withdrawal transaction
            const withdrawalTransaction = await WalletTransaction.create({
                wallet_id: wallet.id,
                type: 'withdrawal',
                amount: -Math.abs(amount), // Negative amount for withdrawal
                currency: 'BOM',
                description: `Withdrawal to ${method}: ${payoutDetails}`,
                status: 'pending',
                metadata: {
                    method: method,
                    payout_details: payoutDetails,
                    usd_value: amount, // 1 BOM = $1 USD
                    processed_by: null,
                    processed_at: null
                }
            }, { transaction });
            
            // Create withdrawal record
            const withdrawal = await Withdrawal.create({
                user_id: userId,
                amount: amount,
                method: method,
                payout_details: payoutDetails,
                usd_value: amount,
                status: 'pending',
                transaction_id: withdrawalTransaction.id
            }, { transaction });
            
            await transaction.commit();
            
            return {
                id: withdrawal.id,
                amount: withdrawal.amount,
                method: withdrawal.method,
                status: withdrawal.status,
                created_at: withdrawal.created_at
            };
            
        } catch (error) {
            await transaction.rollback();
            console.error('Request withdrawal error:', error);
            throw error;
        }
    }
    
    // Transfer BOM between users
    static async transfer(senderId, receiverId, amount, description) {
        const transaction = await WalletTransaction.sequelize.transaction();
        
        try {
            // Get sender wallet
            const senderWallet = await Wallet.findOne({ 
                where: { user_id: senderId },
                transaction
            });
            
            if (!senderWallet) {
                throw new Error('Sender wallet not found');
            }
            
            if (senderWallet.is_frozen) {
                throw new Error('Sender wallet is frozen');
            }
            
            if (parseFloat(senderWallet.balance) < parseFloat(amount)) {
                throw new Error('Insufficient balance');
            }
            
            // Get receiver wallet (create if doesn't exist)
            let receiverWallet = await Wallet.findOne({ 
                where: { user_id: receiverId },
                transaction
            });
            
            if (!receiverWallet) {
                receiverWallet = await Wallet.create({
                    user_id: receiverId,
                    balance: 0.00,
                    currency: 'BOM',
                    is_frozen: false
                }, { transaction });
            }
            
            if (receiverWallet.is_frozen) {
                throw new Error('Receiver wallet is frozen');
            }
            
            // Calculate fees based on sender's subscription tier
            const senderSubscription = await UserSubscription.findOne({
                where: { 
                    user_id: senderId,
                    status: 'active'
                },
                transaction
            });
            
            const feePercentage = senderSubscription?.tier === 'premium' ? 0.005 : 0.01; // 0.5% for premium, 1% for freemium
            const feeAmount = amount * feePercentage;
            const netAmount = amount - feeAmount;
            
            // Update balances
            const newSenderBalance = parseFloat(senderWallet.balance) - amount;
            await senderWallet.update({
                balance: newSenderBalance
            }, { transaction });
            
            const newReceiverBalance = parseFloat(receiverWallet.balance) + netAmount;
            await receiverWallet.update({
                balance: newReceiverBalance
            }, { transaction });
            
            // Create sender transaction
            await WalletTransaction.create({
                wallet_id: senderWallet.id,
                type: 'transfer',
                amount: -amount,
                currency: 'BOM',
                description: `Transfer to user ${receiverId}: ${description}`,
                status: 'completed',
                metadata: {
                    receiver_id: receiverId,
                    fee: feeAmount,
                    net_amount: netAmount
                }
            }, { transaction });
            
            // Create receiver transaction
            await WalletTransaction.create({
                wallet_id: receiverWallet.id,
                type: 'transfer',
                amount: netAmount,
                currency: 'BOM',
                description: `Transfer from user ${senderId}: ${description}`,
                status: 'completed',
                metadata: {
                    sender_id: senderId,
                    original_amount: amount,
                    fee: feeAmount
                }
            }, { transaction });
            
            // Create fee transaction for platform
            if (feeAmount > 0) {
                const platformWallet = await Wallet.findOne({
                    where: { user_id: 0 }, // Platform wallet
                    transaction
                });
                
                if (!platformWallet) {
                    await Wallet.create({
                        user_id: 0,
                        balance: feeAmount,
                        currency: 'BOM',
                        is_frozen: false
                    }, { transaction });
                } else {
                    const newPlatformBalance = parseFloat(platformWallet.balance) + feeAmount;
                    await platformWallet.update({
                        balance: newPlatformBalance
                    }, { transaction });
                }
                
                await WalletTransaction.create({
                    wallet_id: platformWallet?.id || 0,
                    type: 'fee',
                    amount: feeAmount,
                    currency: 'BOM',
                    description: `Transfer fee from user ${senderId} to ${receiverId}`,
                    status: 'completed',
                    metadata: {
                        sender_id: senderId,
                        receiver_id: receiverId,
                        original_amount: amount
                    }
                }, { transaction });
            }
            
            await transaction.commit();
            
            return {
                success: true,
                amount: amount,
                fee: feeAmount,
                netAmount: netAmount,
                senderId: senderId,
                receiverId: receiverId,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            await transaction.rollback();
            console.error('Transfer error:', error);
            throw error;
        }
    }
    
    // Get transaction history
    static async getTransactionHistory(userId, limit = 10, offset = 0) {
        try {
            const wallet = await Wallet.findOne({ where: { user_id: userId } });
            
            if (!wallet) {
                return {
                    transactions: [],
                    pagination: {
                        total: 0,
                        hasMore: false
                    }
                };
            }
            
            const { count, rows } = await WalletTransaction.findAndCountAll({
                where: { wallet_id: wallet.id },
                order: [['created_at', 'DESC']],
                limit: limit + 1, // Get one extra to check if there are more
                offset: offset
            });
            
            const hasMore = rows.length > limit;
            const transactions = hasMore ? rows.slice(0, limit) : rows;
            
            return {
                transactions: transactions.map(tx => ({
                    id: tx.id,
                    type: tx.type,
                    amount: parseFloat(tx.amount),
                    currency: tx.currency,
                    description: tx.description,
                    status: tx.status,
                    created_at: tx.created_at
                })),
                pagination: {
                    total: count,
                    hasMore: hasMore,
                    offset: offset,
                    limit: limit
                }
            };
        } catch (error) {
            console.error('Get transaction history error:', error);
            throw new Error('Failed to get transaction history');
        }
    }
    
    // Admin functions
    static async adminAdjustBalance(userId, amount, description, adminId) {
        const transaction = await WalletTransaction.sequelize.transaction();
        
        try {
            let wallet = await Wallet.findOne({ 
                where: { user_id: userId },
                transaction
            });
            
            if (!wallet) {
                wallet = await Wallet.create({
                    user_id: userId,
                    balance: amount,
                    currency: 'BOM',
                    is_frozen: false
                }, { transaction });
            } else {
                const newBalance = parseFloat(wallet.balance) + parseFloat(amount);
                await wallet.update({
                    balance: newBalance
                }, { transaction });
            }
            
            // Create admin adjustment transaction
            const adminTransaction = await WalletTransaction.create({
                wallet_id: wallet.id,
                type: amount >= 0 ? 'admin_adjustment' : 'admin_deduction',
                amount: amount,
                currency: 'BOM',
                description: description,
                status: 'completed',
                metadata: {
                    admin_id: adminId,
                    adjustment_type: 'manual',
                    timestamp: new Date().toISOString()
                }
            }, { transaction });
            
            await transaction.commit();
            
            return {
                success: true,
                transaction: adminTransaction,
                newBalance: parseFloat(wallet.balance)
            };
            
        } catch (error) {
            await transaction.rollback();
            console.error('Admin adjust balance error:', error);
            throw error;
        }
    }
    
    static async freezeWallet(userId, reason, adminId) {
        try {
            const wallet = await Wallet.findOne({ where: { user_id: userId } });
            
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            if (wallet.is_frozen) {
                throw new Error('Wallet already frozen');
            }
            
            await wallet.update({
                is_frozen: true,
                freeze_reason: reason
            });
            
            // Log the freeze action
            await WalletTransaction.create({
                wallet_id: wallet.id,
                type: 'admin_action',
                amount: 0,
                currency: 'BOM',
                description: `Wallet frozen by admin ${adminId}: ${reason}`,
                status: 'completed',
                metadata: {
                    admin_id: adminId,
                    action: 'freeze',
                    reason: reason,
                    timestamp: new Date().toISOString()
                }
            });
            
            return {
                success: true,
                userId: userId,
                frozen: true,
                reason: reason,
                adminId: adminId,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Freeze wallet error:', error);
            throw error;
        }
    }
    
    static async unfreezeWallet(userId, adminId) {
        try {
            const wallet = await Wallet.findOne({ where: { user_id: userId } });
            
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            if (!wallet.is_frozen) {
                throw new Error('Wallet is not frozen');
            }
            
            await wallet.update({
                is_frozen: false,
                freeze_reason: null
            });
            
            // Log the unfreeze action
            await WalletTransaction.create({
                wallet_id: wallet.id,
                type: 'admin_action',
                amount: 0,
                currency: 'BOM',
                description: `Wallet unfrozen by admin ${adminId}`,
                status: 'completed',
                metadata: {
                    admin_id: adminId,
                    action: 'unfreeze',
                    timestamp: new Date().toISOString()
                }
            });
            
            return {
                success: true,
                userId: userId,
                frozen: false,
                adminId: adminId,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Unfreeze wallet error:', error);
            throw error;
        }
    }
    
    // Get pending deposits (admin only)
    static async getPendingDeposits() {
        try {
            const deposits = await WalletTransaction.findAll({
                where: {
                    type: 'deposit',
                    status: 'pending'
                },
                include: [{
                    model: Wallet,
                    as: 'Wallet',
                    attributes: ['user_id']
                }],
                order: [['created_at', 'ASC']],
                limit: 50
            });
            
            return deposits;
        } catch (error) {
            console.error('Get pending deposits error:', error);
            throw error;
        }
    }
    
    // Get pending withdrawals (admin only)
    static async getPendingWithdrawals() {
        try {
            const withdrawals = await Withdrawal.findAll({
                where: {
                    status: 'pending'
                },
                include: [{
                    model: User,
                    attributes: ['username', 'first_name']
                }],
                order: [['created_at', 'ASC']],
                limit: 50
            });
            
            return withdrawals;
        } catch (error) {
            console.error('Get pending withdrawals error:', error);
            throw error;
        }
    }
    
    // Get wallet statistics (admin only)
    static async getWalletStats() {
        try {
            const [
                totalWallets,
                frozenWallets,
                totalBalanceResult,
                totalDeposits,
                totalWithdrawals
            ] = await Promise.all([
                Wallet.count(),
                Wallet.count({ where: { is_frozen: true } }),
                Wallet.findOne({
                    attributes: [
                        [Sequelize.fn('SUM', Sequelize.col('balance')), 'total']
                    ],
                    where: { user_id: { [Op.ne]: 0 } } // Exclude platform wallet
                }),
                WalletTransaction.sum('amount', {
                    where: {
                        type: 'deposit',
                        status: 'completed',
                        amount: { [Op.gt]: 0 }
                    }
                }),
                WalletTransaction.sum('amount', {
                    where: {
                        type: 'withdrawal',
                        status: 'completed'
                    }
                })
            ]);
            
            const totalBalance = parseFloat(totalBalanceResult?.dataValues?.total || 0);
            const totalDepositsValue = parseFloat(totalDeposits || 0);
            const totalWithdrawalsValue = Math.abs(parseFloat(totalWithdrawals || 0));
            const netRevenue = totalDepositsValue - totalWithdrawalsValue;
            
            return {
                totalWallets,
                activeWallets: totalWallets - frozenWallets,
                frozenWallets,
                totalBalance,
                totalDeposits: totalDepositsValue,
                totalWithdrawals: totalWithdrawalsValue,
                netRevenue
            };
        } catch (error) {
            console.error('Get wallet stats error:', error);
            throw error;
        }
    }
}

module.exports = WalletService;