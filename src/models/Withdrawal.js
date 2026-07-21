const { DataTypes } = require('sequelize');
const { sequelize } = require('../../database/db');

const Withdrawal = sequelize.define('Withdrawal', {
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
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'ETB'
  },
  status: {
    type: DataTypes.STRING(20), // TEMPORARY: Changed from ENUM to STRING
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'processing', 'completed', 'rejected']]
    }
  },
  payment_method: {
    type: DataTypes.STRING,
    allowNull: false
  },
  payment_details: {
    type: DataTypes.JSON,
    allowNull: true
  },
  admin_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  processed_by: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'withdrawals',
  timestamps: false,
  indexes: [
    {
      fields: ['bot_id', 'user_id']
    },
    {
      fields: ['status']
    }
  ]
});

// Associations (keep these the same)
Withdrawal.belongsTo(require('./Bot'), { 
  foreignKey: 'bot_id', 
  as: 'Bot' 
});

Withdrawal.belongsTo(require('./User'), {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'User'
});

Withdrawal.belongsTo(require('./User'), {
  foreignKey: 'processed_by',
  targetKey: 'telegram_id',
  as: 'Processor'
});

module.exports = Withdrawal;