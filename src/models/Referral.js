const { DataTypes } = require('sequelize');
const { sequelize } = require('../../database/db');

const Referral = sequelize.define('Referral', {
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
  referrer_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  referred_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  referral_code: {
    type: DataTypes.STRING,
    allowNull: false
  },
  amount_earned: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  is_completed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: true // Add this temporarily to fix existing NULL values
  }
}, {
  tableName: 'referrals',
  timestamps: true, // This creates createdAt and updatedAt automatically
  createdAt: 'created_at', // Map Sequelize's createdAt to your created_at column
  updatedAt: false, // You don't have updated_at column, so disable it
  underscored: true, // This converts camelCase to snake_case automatically
  indexes: [
    {
      fields: ['bot_id', 'referrer_id']
    },
    {
      fields: ['referral_code']
    },
    {
      fields: ['referred_id']
    }
  ]
});

// Make sure associations are correctly defined
Referral.associate = (models) => {
  Referral.belongsTo(models.User, {
    foreignKey: 'referrer_id',
    as: 'ReferrerUser'
  });
  
  Referral.belongsTo(models.User, {
    foreignKey: 'referred_id',
    as: 'ReferredUser'
  });
  
  Referral.belongsTo(models.Bot, {
    foreignKey: 'bot_id'
  });
};

module.exports = Referral;