// config/environment.js - RAILWAY DEPLOYMENT VERSION
// REMOVE THIS: require('dotenv').config(); - Moved to app.js

function createConfig() {
  const env = process.env.NODE_ENV || 'production';
  const isDevelopment = env === 'development';
  const isProduction = env === 'production';
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_STATIC_URL;
  const isCpanel = false;

  return {
    // ==================== ENVIRONMENT ====================
    NODE_ENV: env,
    IS_DEVELOPMENT: isDevelopment,
    IS_PRODUCTION: isProduction,
    IS_RAILWAY: !!isRailway,
    IS_CPANEL: isCpanel,
    
    // ==================== BOT CONFIGURATION ====================
    BOT_TOKEN: process.env.BOT_TOKEN,
    MAIN_BOT_USERNAME: '@BotomicsBot',
    MAIN_BOT_NAME: 'BotomicsBot',
    
    // Railway provides the public URL
    WEBHOOK_URL: process.env.RAILWAY_STATIC_URL || process.env.WEBHOOK_URL,
    
    // ==================== DATABASE CONFIGURATION ====================
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_DIALECT: 'postgres',
    
    // Connection pool settings
    DATABASE_POOL_MAX: parseInt(process.env.DATABASE_POOL_MAX) || 10,
    DATABASE_POOL_IDLE: parseInt(process.env.DATABASE_POOL_IDLE) || 30000,
    DATABASE_POOL_ACQUIRE: parseInt(process.env.DATABASE_POOL_ACQUIRE) || 60000,
    
    // ==================== ENCRYPTION ====================
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    
    // ==================== SERVER CONFIGURATION ====================
    PORT: process.env.PORT || 3000,
    HOST: process.env.HOST || '0.0.0.0',
    
    // ==================== SECURITY & LIMITS ====================
    MAX_BOTS_PER_USER: parseInt(process.env.MAX_BOTS_PER_USER) || 10,
    MAX_ADMINS_PER_BOT: parseInt(process.env.MAX_ADMINS_PER_BOT) || 10,
    MAX_BROADCAST_LENGTH: parseInt(process.env.MAX_BROADCAST_LENGTH) || 4000,
    
    // ==================== WALLET CONFIGURATION ====================
    WALLET_URL: process.env.WALLET_URL || (isRailway ? `${process.env.RAILWAY_STATIC_URL}/wallet` : 'https://testweb.maroset.com/wallet'),
    APP_URL: process.env.APP_URL || process.env.RAILWAY_STATIC_URL,
    
    // ==================== PLATFORM ADMIN ====================
    PLATFORM_CREATOR_ID: process.env.PLATFORM_CREATOR_ID || '1827785384'
  };
}

// Export the factory function instead of immediately executing
module.exports = createConfig;