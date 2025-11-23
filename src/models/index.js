const { sequelize } = require('../../database/db');
const User = require('./User');
const Bot = require('./Bot');
const Admin = require('./Admin');
const Feedback = require('./Feedback');
const UserLog = require('./UserLog');
const BroadcastHistory = require('./BroadcastHistory');

// NEW MODELS
const ChannelJoin = require('./ChannelJoin');
const ReferralProgram = require('./ReferralProgram');
const Referral = require('./Referral');
const Withdrawal = require('./Withdrawal');
const UserBan = require('./UserBan');

// Define associations

// Bot belongs to User (owner)
Bot.belongsTo(User, { 
  foreignKey: 'owner_id', 
  targetKey: 'telegram_id', 
  as: 'Owner' 
});

// User has many Bots (as owner)
User.hasMany(Bot, { 
  foreignKey: 'owner_id', 
  sourceKey: 'telegram_id', 
  as: 'OwnedBots' 
});

// Admin associations
Admin.belongsTo(Bot, { 
  foreignKey: 'bot_id', 
  as: 'AdminBot'  // Changed from 'Bot' to 'AdminBot'
});

Admin.belongsTo(User, { 
  foreignKey: 'admin_user_id', 
  targetKey: 'telegram_id', 
  as: 'AdminUser'  // Changed from 'User' to 'AdminUser'
});

Bot.hasMany(Admin, { 
  foreignKey: 'bot_id', 
  as: 'Admins' 
});

User.hasMany(Admin, { 
  foreignKey: 'admin_user_id', 
  sourceKey: 'telegram_id', 
  as: 'AdminRoles' 
});

// Feedback associations
Feedback.belongsTo(Bot, { 
  foreignKey: 'bot_id', 
  as: 'FeedbackBot'  // Changed from 'Bot' to 'FeedbackBot'
});

Bot.hasMany(Feedback, { 
  foreignKey: 'bot_id', 
  as: 'Feedbacks' 
});

Feedback.belongsTo(User, {
  foreignKey: 'replied_by',
  targetKey: 'telegram_id',
  as: 'FeedbackReplier'  // Changed from 'Replier' to 'FeedbackReplier'
});

// UserLog associations
UserLog.belongsTo(Bot, { 
  foreignKey: 'bot_id', 
  as: 'UserLogBot'  // Changed from 'Bot' to 'UserLogBot'
});

Bot.hasMany(UserLog, { 
  foreignKey: 'bot_id', 
  as: 'UserLogs' 
});

// BroadcastHistory associations
BroadcastHistory.belongsTo(Bot, { 
  foreignKey: 'bot_id', 
  as: 'BroadcastBot'  // Changed from 'Bot' to 'BroadcastBot'
});

Bot.hasMany(BroadcastHistory, { 
  foreignKey: 'bot_id', 
  as: 'BroadcastHistories' 
});

BroadcastHistory.belongsTo(User, {
  foreignKey: 'sent_by',
  targetKey: 'telegram_id',
  as: 'BroadcastSender'  // Changed from 'Sender' to 'BroadcastSender'
});

// NEW ASSOCIATIONS

// ChannelJoin associations
ChannelJoin.belongsTo(Bot, { 
  foreignKey: 'bot_id', 
  as: 'ChannelBot'  // Changed from 'Bot' to 'ChannelBot'
});

Bot.hasMany(ChannelJoin, { 
  foreignKey: 'bot_id', 
  as: 'ChannelJoins' 
});

// ReferralProgram associations
ReferralProgram.belongsTo(Bot, { 
  foreignKey: 'bot_id', 
  as: 'ReferralProgramBot'  // Changed from 'Bot' to 'ReferralProgramBot'
});

Bot.hasOne(ReferralProgram, { 
  foreignKey: 'bot_id', 
  as: 'ReferralProgram' 
});

// Referral associations
Referral.belongsTo(Bot, { 
  foreignKey: 'bot_id', 
  as: 'ReferralBot'  // Changed from 'Bot' to 'ReferralBot'
});

Bot.hasMany(Referral, { 
  foreignKey: 'bot_id', 
  as: 'Referrals' 
});

Referral.belongsTo(User, {
  foreignKey: 'referrer_id',
  targetKey: 'telegram_id',
  as: 'ReferralReferrer'  // Changed from 'Referrer' to 'ReferralReferrer'
});

Referral.belongsTo(User, {
  foreignKey: 'referred_id',
  targetKey: 'telegram_id',
  as: 'ReferralReferred'  // Changed from 'ReferredUser' to 'ReferralReferred'
});

// Withdrawal associations
Withdrawal.belongsTo(Bot, { 
  foreignKey: 'bot_id', 
  as: 'WithdrawalBot'  // Changed from 'Bot' to 'WithdrawalBot'
});

Bot.hasMany(Withdrawal, { 
  foreignKey: 'bot_id', 
  as: 'Withdrawals' 
});

Withdrawal.belongsTo(User, {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'WithdrawalUser'  // Changed from 'User' to 'WithdrawalUser'
});

Withdrawal.belongsTo(User, {
  foreignKey: 'processed_by',
  targetKey: 'telegram_id',
  as: 'WithdrawalProcessor'  // Changed from 'Processor' to 'WithdrawalProcessor'
});

// UserBan associations
UserBan.belongsTo(Bot, { 
  foreignKey: 'bot_id', 
  as: 'BanBot'  // Changed from 'Bot' to 'BanBot'
});

Bot.hasMany(UserBan, { 
  foreignKey: 'bot_id', 
  as: 'UserBans' 
});

UserBan.belongsTo(User, {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'BannedUser'  // Changed from 'User' to 'BannedUser'
});

UserBan.belongsTo(User, {
  foreignKey: 'banned_by',
  targetKey: 'telegram_id',
  as: 'BanInitiator'  // Changed from 'BannedBy' to 'BanInitiator'
});

UserBan.belongsTo(User, {
  foreignKey: 'unbanned_by',
  targetKey: 'telegram_id',
  as: 'UnbanInitiator'  // Changed from 'UnbannedBy' to 'UnbanInitiator'
});

module.exports = {
  sequelize,
  User,
  Bot,
  Admin,
  Feedback,
  UserLog,
  BroadcastHistory,
  // NEW MODELS
  ChannelJoin,
  ReferralProgram,
  Referral,
  Withdrawal,
  UserBan
};