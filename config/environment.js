// config/environment.js - RAILWAY DEPLOYMENT VERSION
require('dotenv').config();

const env = process.env.NODE_ENV || 'production';
const isDevelopment = env === 'development';
const isProduction = env === 'production';

// Detect Railway environment
const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_STATIC_URL;
const isCpanel = false; // Set to false for Railway

const config = {
  // ==================== ENVIRONMENT ====================
  NODE_ENV: env,
  IS_DEVELOPMENT: isDevelopment,
  IS_PRODUCTION: isProduction,
  IS_RAILWAY: isRailway,
  IS_CPANEL: isCpanel,
  
  // ==================== BOT CONFIGURATION ====================
  BOT_TOKEN: process.env.BOT_TOKEN,
  MAIN_BOT_USERNAME: '@BotomicsBot',
  MAIN_BOT_NAME: 'BotomicsBot',
  
  // Railway provides the public URL
  WEBHOOK_URL: process.env.RAILWAY_STATIC_URL || process.env.WEBHOOK_URL,
  
  // ==================== DATABASE CONFIGURATION ====================
  // Railway provides DATABASE_URL for PostgreSQL
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
  HOST: process.env.HOST || '0.0.0.0', // Railway requires 0.0.0.0
  
  // ==================== SECURITY & LIMITS ====================
  MAX_BOTS_PER_USER: parseInt(process.env.MAX_BOTS_PER_USER) || 10,
  MAX_ADMINS_PER_BOT: parseInt(process.env.MAX_ADMINS_PER_BOT) || 10,
  MAX_BROADCAST_LENGTH: parseInt(process.env.MAX_BROADCAST_LENGTH) || 4000,
  
  // Rate limiting
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000,
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  
  // ==================== FEATURE FLAGS ====================
  ENABLE_BROADCASTS: process.env.ENABLE_BROADCASTS !== 'false',
  ENABLE_TEAM_MANAGEMENT: process.env.ENABLE_TEAM_MANAGEMENT !== 'false',
  ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS !== 'false',
  ENABLE_MINI_BOT_DASHBOARD: process.env.ENABLE_MINI_BOT_DASHBOARD !== 'false',
  ENABLE_DIRECT_MANAGEMENT: process.env.ENABLE_DIRECT_MANAGEMENT !== 'false',
  
  // ==================== MINI-BOT SPECIFIC ====================
  MINI_BOT_COMMANDS_ENABLED: process.env.MINI_BOT_COMMANDS_ENABLED !== 'false',
  REAL_TIME_NOTIFICATIONS: process.env.REAL_TIME_NOTIFICATIONS !== 'false',
  AUTO_RESTART_BOTS: process.env.AUTO_RESTART_BOTS !== 'false',
  
  // ==================== LOGGING ====================
  LOG_LEVEL: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  LOG_FILE: process.env.LOG_FILE || './logs/app.log',
  
  // ==================== PERFORMANCE ====================
  MINI_BOT_TIMEOUT: parseInt(process.env.MINI_BOT_TIMEOUT) || 90000,
  BROADCAST_RATE_LIMIT: parseInt(process.env.BROADCAST_RATE_LIMIT) || 20,
  
  // ==================== BOT PERSISTENCE ====================
  PERSIST_BOT_SESSIONS: process.env.PERSIST_BOT_SESSIONS !== 'false',
  AUTO_RECONNECT_BOTS: process.env.AUTO_RECONNECT_BOTS !== 'false',
  
  // ==================== WALLET CONFIGURATION ====================
  WALLET_URL: process.env.WALLET_URL || (isRailway ? `${process.env.RAILWAY_STATIC_URL}/wallet` : 'https://testweb.maroset.com/wallet'),
  APP_URL: process.env.APP_URL || process.env.RAILWAY_STATIC_URL,
  
  // ==================== PLATFORM ADMIN ====================
  PLATFORM_CREATOR_ID: process.env.PLATFORM_CREATOR_ID || '1827785384'
};

// Log configuration
console.log('🔧 Loading environment configuration...');
console.log('   Environment:', config.NODE_ENV);
console.log('   Platform:', config.IS_RAILWAY ? 'Railway 🚂' : (config.IS_CPANEL ? 'cPanel' : 'Local'));
console.log('   Port:', config.PORT);

if (config.IS_RAILWAY) {
  console.log('✅ Running on Railway.com deployment');
}

// Validate critical configuration
const requiredVars = ['BOT_TOKEN', 'DATABASE_URL', 'ENCRYPTION_KEY'];
const missingVars = requiredVars.filter(varName => !config[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('💡 How to fix on Railway:');
  console.error('   1. Go to Railway Dashboard → Your Project → Variables');
  console.error('   2. Add the missing environment variables');
  console.error('   3. Redeploy your application');
  
  if (config.IS_PRODUCTION) {
    process.exit(1);
  }
}

console.log('✅ Environment configuration loaded successfully');
console.log('   BOT_TOKEN:', config.BOT_TOKEN ? '***' + config.BOT_TOKEN.slice(-6) : 'NOT SET');
console.log('   DATABASE_URL:', config.DATABASE_URL ? 'SET (PostgreSQL)' : 'NOT SET');
console.log('   APP_URL:', config.APP_URL || 'Not set (will use relative URLs)');

module.exports = config;