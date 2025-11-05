const config = {
  // ==================== BOT CONFIGURATION ====================
  BOT_TOKEN: process.env.BOT_TOKEN,
  MAIN_BOT_USERNAME: process.env.MAIN_BOT_USERNAME || '@MarCreatorBot',
  MAIN_BOT_NAME: process.env.MAIN_BOT_NAME || 'MarCreatorBot',
  WEBHOOK_URL: process.env.WEBHOOK_URL || `https://${process.env.RAILWAY_STATIC_URL || `localhost:${process.env.PORT || 3000}`}`,
  
  // ==================== DATABASE CONFIGURATION ====================
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_DIALECT: 'postgres',
  
  // Connection pool settings
  DATABASE_POOL_MAX: parseInt(process.env.DATABASE_POOL_MAX) || 20,
  DATABASE_POOL_IDLE: parseInt(process.env.DATABASE_POOL_IDLE) || 30000,
  DATABASE_POOL_ACQUIRE: parseInt(process.env.DATABASE_POOL_ACQUIRE) || 60000,

  
// ==================== ENCRYPTION ====================
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  
  // ==================== SERVER CONFIGURATION ====================
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  HOST: process.env.HOST || '0.0.0.0',
  
  // ==================== SECURITY & LIMITS ====================
  MAX_BOTS_PER_USER: 10,
  MAX_ADMINS_PER_BOT: 10,
  MAX_BROADCAST_LENGTH: 4000,
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 900000,
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // ==================== FEATURE FLAGS ====================
  ENABLE_BROADCASTS: true,
  ENABLE_TEAM_MANAGEMENT: true,
  ENABLE_ANALYTICS: true,
  ENABLE_MINI_BOT_DASHBOARD: true,
  ENABLE_DIRECT_MANAGEMENT: true,
  
  // ==================== MINI-BOT SPECIFIC ====================
  MINI_BOT_COMMANDS_ENABLED: true,
  REAL_TIME_NOTIFICATIONS: true,
  AUTO_RESTART_BOTS: true,
  
  // ==================== WATERMARK & BRANDING ====================
  WATERMARK_TEXT: '✨ Created with [MarCreatorBot](https://t.me/MarCreatorBot)',
  BOT_NAME: 'MarCreatorBot',
  SUPPORT_USERNAME: 'MarCreatorSupportBot',
  
  // ==================== LOGGING ====================
  LOG_LEVEL: 'info',
  LOG_FILE: './logs/app.log',
  
  // ==================== BACKUP & MAINTENANCE ====================
  BACKUP_ENABLED: false,
  BACKUP_SCHEDULE: '0 2 * * *',
  BACKUP_RETENTION_DAYS: 7,
  
  // ==================== PERFORMANCE ====================
  CACHE_ENABLED: true,
  CACHE_TTL: 300000,
  
  // Mini-bot performance
  MINI_BOT_TIMEOUT: 90000,
  BROADCAST_RATE_LIMIT: 20,
  
  // ==================== MONITORING ====================
  HEALTH_CHECK_INTERVAL: 30000,
  METRICS_ENABLED: false,
  
  // ==================== BOT PERSISTENCE ====================
  PERSIST_BOT_SESSIONS: true,
  AUTO_RECONNECT_BOTS: true,
};

console.log('🔧 Loading environment configuration...');
console.log('✅ Environment loaded:');
console.log('   NODE_ENV:', config.NODE_ENV);
console.log('   PORT:', config.PORT);
console.log('   BOT_TOKEN:', config.BOT_TOKEN ? '***' + config.BOT_TOKEN.slice(-4) : 'NOT SET');
console.log('   MAIN_BOT:', config.MAIN_BOT_NAME);
console.log('   DATABASE: POSTGRESQL');
console.log('   DATABASE_URL:', config.DATABASE_URL ? 'SET (' + config.DATABASE_URL.length + ' chars)' : 'NOT SET');

module.exports = config;