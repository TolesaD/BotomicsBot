// In src/models/ProductCatalog.js, update the model definition:

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../database/db');

const ProductCatalog = sequelize.define('ProductCatalog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bot_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'bots',
      key: 'id'
    }
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'BOM'
  },
  stock_quantity: {
    type: DataTypes.INTEGER,
    allowNull: true // null means unlimited
  },
  is_digital: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  digital_content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // ADD THESE IMAGE FIELDS:
  image_file_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Telegram file_id for the product image'
  },
  image_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'URL for product image (if uploaded externally)'
  },
  has_image: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
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
  tableName: 'product_catalog',
  timestamps: false,
  hooks: {
    beforeCreate: (product) => {
      // Set has_image based on image fields
      product.has_image = !!(product.image_file_id || product.image_url);
    },
    beforeUpdate: (product) => {
      product.updated_at = new Date();
      // Update has_image
      product.has_image = !!(product.image_file_id || product.image_url);
    }
  },
  indexes: [
    {
      fields: ['bot_id']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = ProductCatalog;