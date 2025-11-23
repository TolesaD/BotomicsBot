const { DataTypes } = require('sequelize');
const { sequelize } = require('../../database/db');

const ChannelJoin = sequelize.define('ChannelJoin', {
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
  channel_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  channel_username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  channel_title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'channel_joins',
  timestamps: false,
  indexes: [
    {
      fields: ['bot_id']
    },
    {
      fields: ['channel_id']
    }
  ]
});

// Association
ChannelJoin.belongsTo(require('./Bot'), { 
  foreignKey: 'bot_id', 
  as: 'Bot' 
});

module.exports = ChannelJoin;