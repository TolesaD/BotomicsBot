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
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'referrals',
  timestamps: false,
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

// Associations
Referral.belongsTo(require('./Bot'), { 
  foreignKey: 'bot_id', 
  as: 'Bot' 
});

Referral.belongsTo(require('./User'), {
  foreignKey: 'referrer_id',
  targetKey: 'telegram_id',
  as: 'Referrer'
});

Referral.belongsTo(require('./User'), {
  foreignKey: 'referred_id',
  targetKey: 'telegram_id',
  as: 'ReferredUser'
});

module.exports = Referral;