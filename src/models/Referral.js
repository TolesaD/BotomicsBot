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
  timestamps: true, // Changed from false to true for automatic createdAt/updatedAt
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
    as: 'ReferredUser' // This alias should match what we use in ReferralHandler
  });
  
  Referral.belongsTo(models.Bot, {
    foreignKey: 'bot_id'
  });
};

module.exports = Referral;