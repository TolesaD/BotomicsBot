const { DataTypes } = require('sequelize');
const { sequelize } = require('../../database/db');

const ProductOrder = sequelize.define('ProductOrder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  order_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    defaultValue: () => {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      return `ORDER_${timestamp}_${random}`;
    }
  },
  bot_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'bots',
      key: 'id'
    }
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'product_catalog',
      key: 'id'
    }
  },
  customer_user_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'BOM'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']]
    }
  },
  payment_method: {
    type: DataTypes.STRING(20),
    defaultValue: 'bom'
  },
  payment_transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  delivery_details: {
    type: DataTypes.JSON,
    allowNull: true
  },
  digital_content_delivered: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'product_orders',
  timestamps: false,
  hooks: {
    beforeCreate: (order) => {
      // Generate order number
      if (!order.order_number) {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        order.order_number = `ORDER_${timestamp}_${random}`;
      }
    },
    beforeUpdate: (order) => {
      order.updated_at = new Date();
    }
  },
  indexes: [
    {
      fields: ['order_number']
    },
    {
      fields: ['bot_id']
    },
    {
      fields: ['customer_user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = ProductOrder;