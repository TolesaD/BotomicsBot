// config/environment.js - YEGARA.COM CPANEL VERSION
const config = {
  // ==================== BOT CONFIGURATION ====================
  BOT_TOKEN: process.env.BOT_TOKEN,
  MAIN_BOT_USERNAME: process.env.MAIN_BOT_USERNAME || '@MarCreatorBot',
  MAIN_BOT_NAME: process.env.MAIN_BOT_NAME || 'MarCreatorBot',
  WEBHOOK_URL: process.env.WEBHOOK_URL || `http://localhost:${process.env.PORT || 3000}`,
  
  // ==================== DATABASE CONFIGURATION ====================
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_DIALECT: 'postgres',
  
  // Connection pool settings
  DATABASE_POOL_MAX: parseInt(process.env.DATABASE_POOL_MAX) || 10, // Lower for cPanel
  DATABASE_POOL_IDLE: parseInt(process.env.DATABASE_POOL_IDLE) || 30000,
  DATABASE_POOL_ACQUIRE: parseInt(process.env.DATABASE_POOL_ACQUIRE) || 60000,
  
  // ==================== ENCRYPTION ====================
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  
  // ==================== SERVER CONFIGURATION ====================
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  HOST: process.env.HOST || '0.0.0.0',
  
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
  
  // ==================== WATERMARK & BRANDING ====================
  WATERMARK_TEXT: '✨ Created with [MarCreatorBot](https://t.me/MarCreatorBot)',
  BOT_NAME: process.env.BOT_NAME || 'MarCreatorBot',
  SUPPORT_USERNAME: process.env.SUPPORT_USERNAME || 'MarCreatorSupportBot',
  
  // ==================== LOGGING ====================
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || './logs/app.log',
  
  // ==================== BACKUP & MAINTENANCE ====================
  BACKUP_ENABLED: process.env.BACKUP_ENABLED === 'true',
  BACKUP_SCHEDULE: process.env.BACKUP_SCHEDULE || '0 2 * * *',
  BACKUP_RETENTION_DAYS: parseInt(process.env.BACKUP_RETENTION_DAYS) || 7,
  
  // ==================== PERFORMANCE ====================
  CACHE_ENABLED: process.env.CACHE_ENABLED !== 'false',
  CACHE_TTL: parseInt(process.env.CACHE_TTL) || 300000,
  
  // Mini-bot performance
  MINI_BOT_TIMEOUT: parseInt(process.env.MINI_BOT_TIMEOUT) || 90000,
  BROADCAST_RATE_LIMIT: parseInt(process.env.BROADCAST_RATE_LIMIT) || 20,
  
  // ==================== MONITORING ====================
  HEALTH_CHECK_INTERVAL: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
  METRICS_ENABLED: process.env.METRICS_ENABLED === 'true',
  
  // ==================== BOT PERSISTENCE ====================
  PERSIST_BOT_SESSIONS: process.env.PERSIST_BOT_SESSIONS !== 'false',
  AUTO_RECONNECT_BOTS: process.env.AUTO_RECONNECT_BOTS !== 'false',
};

// ==================== VALIDATION ====================
console.log('🔧 Loading environment configuration...');

// Detect cPanel environment
const isCpanel = process.env.HOME && process.env.HOME.includes('/home/');
if (isCpanel) {
  console.log('✅ Running on Yegara.com cPanel');
}

console.log('   Environment:', config.NODE_ENV);
console.log('   Port:', config.PORT);

// Validate critical configuration
if (!config.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required but not set');
  console.error('💡 How to fix on Yegara.com:');
  console.error('   1. Go to cPanel → Environment Variables');
  console.error('   2. Add BOT_TOKEN with your Telegram bot token');
  console.error('   3. Redeploy your application');
  if (config.NODE_ENV === 'production') {
    process.exit(1);
  }
}

if (!config.ENCRYPTION_KEY) {
  console.error('❌ ENCRYPTION_KEY is required but not set');
  console.error('💡 How to fix on Yegara.com:');
  console.error('   1. Go to cPanel → Environment Variables');
  console.error('   2. Add ENCRYPTION_KEY with your encryption key');
  console.error('   3. Redeploy your application');
  if (config.NODE_ENV === 'production') {
    process.exit(1);
  }
}

if (!config.DATABASE_URL) {
  console.error('❌ DATABASE_URL is required but not set');
  console.error('💡 How to fix on Yegara.com:');
  console.error('   1. Go to cPanel → PostgreSQL Databases');
  console.error('   2. Create a database and user');
  console.error('   3. Add DATABASE_URL in Environment Variables');
  console.error('   4. Format: postgresql://user:pass@host:port/dbname');
  if (config.NODE_ENV === 'production') {
    process.exit(1);
  }
}

console.log('✅ Environment configuration loaded:');
console.log('   BOT_TOKEN:', config.BOT_TOKEN ? '***' + config.BOT_TOKEN.slice(-6) : 'NOT SET');
console.log('   ENCRYPTION_KEY:', config.ENCRYPTION_KEY ? 'SET' : 'NOT SET');
console.log('   DATABASE_URL:', config.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('   MAIN_BOT:', config.MAIN_BOT_NAME);

module.exports = config;