const { DataTypes } = require('sequelize');
const { sequelize } = require('../../database/db');

const ReferralProgram = sequelize.define('ReferralProgram', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bot_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'bots',
      key: 'id'
    }
  },
  is_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  referral_rate: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 1.00
  },
  min_withdrawal: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 10.00
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'USD' // Changed from 'ETB' to 'USD'
  },
  required_channels: {
    type: DataTypes.JSON,
    defaultValue: []
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
  tableName: 'referral_programs',
  timestamps: false,
  hooks: {
    beforeUpdate: (program) => {
      program.updated_at = new Date();
    }
  }
});

// Association
ReferralProgram.belongsTo(require('./Bot'), { 
  foreignKey: 'bot_id', 
  as: 'Bot' 
});

module.exports = ReferralProgram;