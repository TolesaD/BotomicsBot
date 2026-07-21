// src/services/productCatalogService.js
const { ProductCatalog, ProductOrder, Bot, User, Wallet, WalletTransaction } = require('../models');
const WalletService = require('./walletService');
const SubscriptionService = require('./subscriptionService');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

class ProductCatalogService {
  
  // Check if bot owner can use product catalog feature
  static async canUseProductCatalog(botId) {
    try {
      const bot = await Bot.findByPk(botId);
      if (!bot) {
        return { canUse: false, reason: 'Bot not found' };
      }
      
      // Only premium users can use product catalog
      const tier = await SubscriptionService.getSubscriptionTier(bot.owner_id);
      
      if (tier !== 'premium') {
        return {
          canUse: false,
          reason: '❌ *Premium Feature Required*\n\nProduct catalog is available for premium users only.\n\n💎 *Upgrade to unlock:*\n• Sell products with BOM payments\n• Digital product delivery\n• Order management system\n\n*Price:* 3 BOM per month ($3.00)',
          tier: 'freemium'
        };
      }
      
      return { canUse: true, tier: 'premium' };
    } catch (error) {
      console.error('Can use product catalog error:', error);
      return { canUse: false, reason: 'Error checking permissions' };
    }
  }
  
  // Get products for a bot
  static async getProducts(botId, includeInactive = false) {
    try {
      const whereCondition = { bot_id: botId };
      if (!includeInactive) {
        whereCondition.is_active = true;
      }
      
      const products = await ProductCatalog.findAll({
        where: whereCondition,
        order: [['created_at', 'DESC']]
      });
      
      return {
        success: true,
        products: products,
        count: products.length
      };
    } catch (error) {
      console.error('Get products error:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Create a new product
  static async createProduct(productData) {
  const transaction = await ProductCatalog.sequelize.transaction();
  
  try {
    // Validate bot
    const bot = await Bot.findByPk(productData.bot_id);
    if (!bot) {
      throw new Error('Bot not found');
    }
    
    // Check permission
    const permission = await this.canUseProductCatalog(productData.bot_id);
    if (!permission.canUse) {
      throw new Error(permission.reason);
    }
    
    // Create product
    const product = await ProductCatalog.create({
      bot_id: productData.bot_id,
      name: productData.name,
      description: productData.description || '',
      price: parseFloat(productData.price) || 0,
      currency: productData.currency || 'BOM',
      stock_quantity: productData.stock_quantity,
      is_digital: productData.is_digital || false,
      digital_content: productData.digital_content,
      image_file_id: productData.image_file_id || null,
      image_url: productData.image_url || null,
      has_image: !!(productData.image_file_id || productData.image_url),
      is_active: true
    }, { transaction });
    
    await transaction.commit();
    
    return {
      success: true,
      product: product,
      message: '✅ Product created successfully!' + 
               (product.has_image ? ' (with image)' : '')
    };
    
  } catch (error) {
    await transaction.rollback();
    console.error('Create product error:', error);
    return {
      success: false,
      error: error.message.includes('Premium Feature Required') ? error.message : 'Failed to create product'
    };
  }
}
  
  // Update a product
  static async updateProduct(productId, productData, userId) {
  const transaction = await ProductCatalog.sequelize.transaction();
  
  try {
    const product = await ProductCatalog.findByPk(productId);
    if (!product) {
      throw new Error('Product not found');
    }
    
    // Check if user owns the bot
    const bot = await Bot.findByPk(product.bot_id);
    
    // DEBUG LOGGING
    console.log(`🔍 updateProduct - Product: ${product.name}, Bot ID: ${product.bot_id}`);
    console.log(`🔍 updateProduct - User ID: ${userId} (type: ${typeof userId})`);
    console.log(`🔍 updateProduct - Bot Owner ID: ${bot.owner_id} (type: ${typeof bot.owner_id})`);
    console.log(`🔍 updateProduct - Loose equality: ${bot.owner_id == userId}`);
    console.log(`🔍 updateProduct - String equality: ${bot.owner_id.toString() === userId.toString()}`);
    
    // Use multiple comparison methods to be safe
    const isOwner = bot.owner_id == userId || 
                    bot.owner_id.toString() === userId.toString() ||
                    parseInt(bot.owner_id) === parseInt(userId);
    
    console.log(`🔍 updateProduct - Is owner? ${isOwner}`);
    
    if (!isOwner) {
      throw new Error('Only bot owner can update products');
    }
    
    // Update product
    await product.update({
      name: productData.name || product.name,
      description: productData.description !== undefined ? productData.description : product.description,
      price: productData.price !== undefined ? parseFloat(productData.price) : product.price,
      stock_quantity: productData.stock_quantity !== undefined ? productData.stock_quantity : product.stock_quantity,
      is_digital: productData.is_digital !== undefined ? productData.is_digital : product.is_digital,
      digital_content: productData.digital_content !== undefined ? productData.digital_content : product.digital_content,
      image_url: productData.image_url !== undefined ? productData.image_url : product.image_url,
      is_active: productData.is_active !== undefined ? productData.is_active : product.is_active
    }, { transaction });
    
    await transaction.commit();
    
    return {
      success: true,
      product: product,
      message: '✅ Product updated successfully!'
    };
    
  } catch (error) {
    await transaction.rollback();
    console.error('Update product error:', error);
    return { success: false, error: error.message };
  }
}
  
  // Delete a product
  static async deleteProduct(productId, userId) {
  const transaction = await ProductCatalog.sequelize.transaction();
  
  try {
    const product = await ProductCatalog.findByPk(productId);
    if (!product) {
      throw new Error('Product not found');
    }
    
    // Check if user owns the bot
    const bot = await Bot.findByPk(product.bot_id);
    
    // DEBUG LOGGING
    console.log(`🔍 deleteProduct - Product: ${product.name}, Bot ID: ${product.bot_id}`);
    console.log(`🔍 deleteProduct - User ID: ${userId} (type: ${typeof userId})`);
    console.log(`🔍 deleteProduct - Bot Owner ID: ${bot.owner_id} (type: ${typeof bot.owner_id})`);
    console.log(`🔍 deleteProduct - Loose equality: ${bot.owner_id == userId}`);
    console.log(`🔍 deleteProduct - String equality: ${bot.owner_id.toString() === userId.toString()}`);
    
    // Use multiple comparison methods to be safe
    const isOwner = bot.owner_id == userId || 
                    bot.owner_id.toString() === userId.toString() ||
                    parseInt(bot.owner_id) === parseInt(userId);
    
    console.log(`🔍 deleteProduct - Is owner? ${isOwner}`);
    
    if (!isOwner) {
      throw new Error('Only bot owner can delete products');
    }
    
    // Check if there are orders for this product
    const orderCount = await ProductOrder.count({
      where: { product_id: productId }
    });
    
    if (orderCount > 0) {
      // Deactivate instead of delete
      await product.update({ is_active: false }, { transaction });
      await transaction.commit();
      
      return {
        success: true,
        message: '⚠️ Product has existing orders. It has been deactivated instead.'
      };
    }
    
    // Delete product
    await product.destroy({ transaction });
    await transaction.commit();
    
    return {
      success: true,
      message: '✅ Product deleted successfully!'
    };
    
  } catch (error) {
    await transaction.rollback();
    console.error('Delete product error:', error);
    return { success: false, error: error.message };
  }
}
  
  // Purchase a product
  static async purchaseProduct(productId, userId, quantity = 1, deliveryDetails = null) {
    const transaction = await ProductCatalog.sequelize.transaction();
    
    try {
      // Get product
      const product = await ProductCatalog.findByPk(productId);
      if (!product) {
        throw new Error('Product not found');
      }
      
      if (!product.is_active) {
        throw new Error('This product is not available');
      }
      
      // Check stock
      if (product.stock_quantity !== null && product.stock_quantity < quantity) {
        throw new Error(`Insufficient stock. Only ${product.stock_quantity} available.`);
      }
      
      // Calculate total
      const totalAmount = parseFloat(product.price) * quantity;
      
      // Check buyer's wallet balance
      const buyerBalance = await WalletService.getBalance(userId);
      if (buyerBalance.balance < totalAmount) {
        throw new Error(`Insufficient balance. You need ${totalAmount} BOM but only have ${buyerBalance.balance.toFixed(2)} BOM.`);
      }
      
      // Check if buyer's wallet is frozen
      if (buyerBalance.isFrozen) {
        throw new Error('Your wallet is frozen. Cannot make purchases.');
      }
      
      // Get bot owner's wallet
      const bot = await Bot.findByPk(product.bot_id);
      await WalletService.getBalance(bot.owner_id); // Ensure wallet exists
      
      // Process payment via transfer
      const transferResult = await WalletService.transfer(
        userId,
        bot.owner_id,
        totalAmount,
        `Purchase: ${product.name} (x${quantity})`
      );
      
      if (!transferResult.success) {
        throw new Error('Payment failed');
      }
      
      // Update stock if limited
      if (product.stock_quantity !== null) {
        const newStock = product.stock_quantity - quantity;
        await product.update({ stock_quantity: newStock }, { transaction });
      }
      
      // Create order
      const order = await ProductOrder.create({
        bot_id: product.bot_id,
        product_id: product.id,
        customer_user_id: userId,
        quantity: quantity,
        unit_price: product.price,
        total_amount: totalAmount,
        currency: product.currency,
        status: 'paid',
        payment_method: 'bom',
        payment_transaction_id: transferResult.transactionId,
        delivery_details: deliveryDetails
      }, { transaction });
      
      // If digital product, mark as ready for delivery
      if (product.is_digital) {
        await order.update({
          digital_content_delivered: false,
          notes: 'Digital product - ready for delivery'
        }, { transaction });
      }
      
// In purchaseProduct method, after creating the order:
await transaction.commit();

// NOTIFY BOT OWNER
const MiniBotManager = require('./MiniBotManager');
const botInstance = MiniBotManager.getBotInstanceByDbId(product.bot_id);
if (botInstance) {
  try {
    const customer = await User.findOne({ where: { telegram_id: userId } });
    const customerName = customer ? `${customer.first_name}${customer.username ? ` (@${customer.username})` : ''}` : `User#${userId}`;
    
    await botInstance.telegram.sendMessage(
      bot.owner_id,
      `🛒 *New Product Order!*\n\n` +
      `*Product:* ${product.name}\n` +
      `*Quantity:* ${quantity}\n` +
      `*Total:* ${totalAmount} BOM ($${totalAmount}.00)\n` +
      `*Customer:* ${customerName}\n` +
      `*Order #:* ${order.order_number}\n\n` +
      `*Status:* ✅ Paid\n` +
      (product.is_digital ? 
        `*Type:* Digital - Use /catalog to deliver content\n` : 
        `*Type:* Physical - Check delivery details\n`) +
      `\nManage orders with /catalog command.`,
      { parse_mode: 'Markdown' }
    );
  } catch (notificationError) {
    console.error('Failed to notify bot owner:', notificationError);
  }
}

// REMOVED: Duplicate customer notification (already handled in MiniBotManager.handleProductPurchase)

return {
  success: true,
  order: order,
  product: product,
  totalAmount: totalAmount,
  message: product.is_digital ? 
    '✅ Purchase successful! The seller will deliver your digital product shortly.' :
    '✅ Purchase successful! The seller will process your order soon.'
};
      
    } catch (error) {
      await transaction.rollback();
      console.error('Purchase product error:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Get orders for a bot
  static async getOrders(botId, status = null, limit = 50, offset = 0) {
    try {
      const whereCondition = { bot_id: botId };
      if (status) {
        whereCondition.status = status;
      }
      
      const { count, rows } = await ProductOrder.findAndCountAll({
        where: whereCondition,
        include: [
          {
            model: require('../models').ProductCatalog,
            as: 'Product',
            attributes: ['name', 'is_digital']
          },
          {
            model: require('../models').User,
            as: 'Customer',
            attributes: ['username', 'first_name', 'telegram_id']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: limit,
        offset: offset
      });
      
      return {
        success: true,
        orders: rows,
        pagination: {
          total: count,
          limit: limit,
          offset: offset,
          hasMore: (offset + limit) < count
        }
      };
    } catch (error) {
      console.error('Get orders error:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Update order status
static async updateOrderStatus(orderId, status, userId, notes = null) {
  const transaction = await ProductOrder.sequelize.transaction();
  
  try {
    const order = await ProductOrder.findByPk(orderId, {
      include: [
        {
          model: require('../models').Bot,
          as: 'OrderBot'
        },
        {
          model: require('../models').ProductCatalog,
          as: 'Product'
        }
      ]
    });
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    // Check if user owns the bot
    if (order.OrderBot.owner_id != userId) {
      throw new Error('Only bot owner can update orders');
    }
    
    // Validate status transition
    const validTransitions = {
      'pending': ['paid', 'cancelled', 'refunded'],
      'paid': ['processing', 'cancelled', 'refunded'],
      'processing': ['shipped', 'delivered', 'cancelled', 'refunded'],
      'shipped': ['delivered', 'refunded'],
      'delivered': [], // Final state
      'cancelled': [], // Final state
      'refunded': [] // Final state
    };
    
    const currentStatus = order.status;
    
    // Allow updating to the same status (for retrying notifications)
    if (currentStatus !== status && !validTransitions[currentStatus]?.includes(status)) {
      throw new Error(`Cannot change status from ${currentStatus} to ${status}`);
    }
    
    console.log(`🔄 Updating order ${order.order_number} from ${currentStatus} to ${status}`);
    
    // Update order
    const updates = { 
      status: status,
      updated_at: new Date()
    };
    
    if (notes) {
      updates.notes = notes;
    }
    
    // If marking as delivered or completed, set completed_at
    if (status === 'delivered' || status === 'cancelled' || status === 'refunded') {
      updates.completed_at = new Date();
    }
    
    // If marking as delivered for digital product, set content delivered
    if (status === 'delivered' && order.Product?.is_digital) {
      updates.digital_content_delivered = true;
    }
    
    await order.update(updates, { transaction });
    
    // Process refunds if needed
    if (status === 'refunded' || (status === 'cancelled' && currentStatus === 'paid')) {
      try {
        const walletService = require('./walletService');
        
        console.log(`💰 Processing refund for order ${order.order_number}, amount: ${order.total_amount}`);
        
        // Refund the amount to customer
        const refundResult = await walletService.transfer(
          order.OrderBot.owner_id, // From bot owner
          order.customer_user_id,  // To customer
          order.total_amount,
          `Refund for order #${order.order_number} (${status})`
        );
        
        if (!refundResult.success) {
          console.error(`❌ Refund failed: ${refundResult.error}`);
          throw new Error(`Refund failed: ${refundResult.error}`);
        }
        
        console.log(`✅ Refund successful: ${refundResult.transactionId}`);
        
        // Add refund note
        if (!updates.notes) {
          updates.notes = '';
        }
        updates.notes += `\nRefund processed: ${refundResult.transactionId}`;
        await order.update({ notes: updates.notes }, { transaction });
      } catch (refundError) {
        console.error('Refund processing error:', refundError);
        // Don't fail the whole transaction if refund fails
        // Just add a note
        if (!updates.notes) {
          updates.notes = '';
        }
        updates.notes += `\n⚠️ Refund attempted but failed: ${refundError.message}`;
        await order.update({ notes: updates.notes }, { transaction });
      }
    }
    
    await transaction.commit();
    
    console.log(`✅ Order ${order.order_number} status updated to ${status}`);
    
    return {
      success: true,
      order: order,
      message: `✅ Order status updated to ${status}`
    };
    
  } catch (error) {
    await transaction.rollback();
    console.error('Update order status error:', error);
    return { success: false, error: error.message };
  }
}
  
// Deliver digital content
static async deliverDigitalContent(orderId, content, userId) {
  const transaction = await ProductOrder.sequelize.transaction();
  
  try {
    const order = await ProductOrder.findByPk(orderId, {
      include: [
        {
          model: require('../models').Bot,
          as: 'OrderBot'
        },
        {
          model: require('../models').ProductCatalog,
          as: 'Product'
        }
      ]
    });
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    if (!order.Product || !order.Product.is_digital) {
      throw new Error('This is not a digital product order');
    }
    
    // FIX: Use loose equality for comparison
    console.log(`🔍 deliverDigitalContent - User ID: ${userId}, Bot Owner ID: ${order.OrderBot.owner_id}`);
    console.log(`🔍 Equality check: ${order.OrderBot.owner_id == userId}`);
    console.log(`🔍 Strict equality: ${order.OrderBot.owner_id === userId}`);
    
    // Check if user owns the bot - USE LOOSE EQUALITY
    if (order.OrderBot.owner_id != userId) {
      throw new Error('Only bot owner can deliver digital content');
    }
    
    console.log(`✅ User ${userId} confirmed as bot owner, proceeding with delivery`);
    
    // Update order with delivery content
    await order.update({
      status: 'delivered',
      digital_content_delivered: true,
      notes: content || 'Digital content delivered'
    }, { transaction });
    
    await transaction.commit();
    
    // Send content to customer
    const MiniBotManager = require('./MiniBotManager');
    const botInstance = MiniBotManager.getBotInstanceByDbId(order.bot_id);
    if (botInstance) {
      try {
        // Send the digital content
        await botInstance.telegram.sendMessage(
          order.customer_user_id,
          `📦 *Digital Product Delivery*\n\n` +
          `*Order #:* ${order.order_number}\n` +
          `*Product:* ${order.Product.name}\n\n` +
          `Here is your digital content:\n\n` +
          `${content}\n\n` +
          `If you have any issues, contact the seller directly.`,
          { parse_mode: 'Markdown' }
        );
        
        // Also send a status update notification
        await MiniBotManager.notifyCustomerOrderStatusUpdate(order, 'delivered');
        
      } catch (notificationError) {
        console.error('Failed to deliver content:', notificationError);
        throw new Error('Failed to deliver content to customer');
      }
    }
    
    return {
      success: true,
      message: '✅ Digital content delivered to customer!'
    };
    
  } catch (error) {
    await transaction.rollback();
    console.error('Deliver digital content error:', error);
    return { success: false, error: error.message };
  }
}
  
  // Get order statistics
  static async getOrderStats(botId) {
    try {
      const [
        totalOrders,
        totalRevenue,
        pendingOrders,
        completedOrders,
        productCount
      ] = await Promise.all([
        ProductOrder.count({ where: { bot_id: botId } }),
        ProductOrder.sum('total_amount', { 
          where: { 
            bot_id: botId,
            status: ['paid', 'processing', 'shipped', 'delivered']
          } 
        }),
        ProductOrder.count({ 
          where: { 
            bot_id: botId,
            status: ['pending', 'processing'] 
          } 
        }),
        ProductOrder.count({ 
          where: { 
            bot_id: botId,
            status: ['delivered'] 
          } 
        }),
        ProductCatalog.count({ 
          where: { 
            bot_id: botId,
            is_active: true 
          } 
        })
      ]);
      
      // Calculate average order value
      const avgOrderValue = totalOrders > 0 ? (totalRevenue || 0) / totalOrders : 0;
      
      return {
        totalOrders,
        totalRevenue: parseFloat(totalRevenue || 0),
        pendingOrders,
        completedOrders,
        productCount,
        avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
        currency: 'BOM'
      };
    } catch (error) {
      console.error('Get order stats error:', error);
      return {
        totalOrders: 0,
        totalRevenue: 0,
        pendingOrders: 0,
        completedOrders: 0,
        productCount: 0,
        avgOrderValue: 0,
        currency: 'BOM'
      };
    }
  }
  
  // Get user's purchase history
  static async getUserPurchases(userId, limit = 20, offset = 0) {
    try {
      const { count, rows } = await ProductOrder.findAndCountAll({
        where: { customer_user_id: userId },
        include: [
          {
            model: require('../models').ProductCatalog,
            as: 'Product',
            attributes: ['name', 'is_digital', 'bot_id']
          },
          {
            model: require('../models').Bot,
            as: 'OrderBot',
            attributes: ['bot_name', 'bot_username']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: limit,
        offset: offset
      });
      
      return {
        success: true,
        purchases: rows,
        pagination: {
          total: count,
          limit: limit,
          offset: offset,
          hasMore: (offset + limit) < count
        }
      };
    } catch (error) {
      console.error('Get user purchases error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ProductCatalogService;