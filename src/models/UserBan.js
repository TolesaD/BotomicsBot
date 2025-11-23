const { DataTypes } = require('sequelize');
const { sequelize } = require('../../database/db');

const UserBan = sequelize.define('UserBan', {
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
  banned_by: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  banned_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  unbanned_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  unbanned_by: {
    type: DataTypes.BIGINT,
    allowNull: true
  }
}, {
  tableName: 'user_bans',
  timestamps: false,
  indexes: [
    {
      fields: ['bot_id', 'user_id']
    },
    {
      fields: ['is_active']
    }
  ]
});

// Associations
UserBan.belongsTo(require('./Bot'), { 
  foreignKey: 'bot_id', 
  as: 'Bot' 
});

UserBan.belongsTo(require('./User'), {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'User'
});

UserBan.belongsTo(require('./User'), {
  foreignKey: 'banned_by',
  targetKey: 'telegram_id',
  as: 'BannedBy'
});

UserBan.belongsTo(require('./User'), {
  foreignKey: 'unbanned_by',
  targetKey: 'telegram_id',
  as: 'UnbannedBy'
});

module.exports = UserBan;