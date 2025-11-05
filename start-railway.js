// start-railway.js - PRODUCTION WITH RAILWAY WORKAROUND
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');
console.log('🔧 PRODUCTION: Setting environment variables (Railway workaround)');

// ==================== RAILWAY WORKAROUND ====================
// Railway's environment variable injection is broken
// We need to set these manually before loading the config
// ============================================================

const productionConfig = {
  // REQUIRED - Core configuration
  DATABASE_URL: 'postgresql://postgres:oVLrRsVtHexHeuAkFSWaXGheLOoHhHvB@yamanote.proxy.rlwy.net:57378/railway',
  BOT_TOKEN: '7983296108:AAH8Dj_5WfhPN7g18jFI2VsexzJAiCjPgpI',
  ENCRYPTION_KEY: 'W370NNal3+hm8KmDwQVOd2tzhW8S5Ma+Fk8MvVMK5QU=',
  
  // OPTIONAL - With defaults
  MAIN_BOT_NAME: 'MarCreatorBot',
  PORT: '8080',
  NODE_ENV: 'production',
  
  // Feature flags
  MAX_BOTS_PER_USER: '10',
  ENABLE_BROADCASTS: 'true',
  ENABLE_TEAM_MANAGEMENT: 'true',
  ENABLE_ANALYTICS: 'true',
  ENABLE_MINI_BOT_DASHBOARD: 'true',
  MINI_BOT_COMMANDS_ENABLED: 'true',
  REAL_TIME_NOTIFICATIONS: 'true',
  AUTO_RESTART_BOTS: 'true',
  PERSIST_BOT_SESSIONS: 'true',
  AUTO_RECONNECT_BOTS: 'true'
};

console.log('🔧 Setting environment variables:');
console.log(`   DATABASE_URL: SET (${productionConfig.DATABASE_URL.length} chars)`);
console.log(`   BOT_TOKEN: SET (${productionConfig.BOT_TOKEN.length} chars)`);
console.log(`   ENCRYPTION_KEY: SET (${productionConfig.ENCRYPTION_KEY.length} chars)`);
console.log(`   MAIN_BOT_NAME: ${productionConfig.MAIN_BOT_NAME}`);
console.log(`   NODE_ENV: ${productionConfig.NODE_ENV}`);

// Set ALL environment variables
Object.keys(productionConfig).forEach(key => {
  process.env[key] = productionConfig[key];
});

console.log('✅ Environment variables set successfully');

// ==================== VALIDATION ====================

// Quick validation before proceeding
if (!process.env.BOT_TOKEN || !process.env.ENCRYPTION_KEY || !process.env.DATABASE_URL) {
  console.error('❌ Critical environment variables missing');
  process.exit(1);
}

if (process.env.ENCRYPTION_KEY.length < 32) {
  console.error('❌ ENCRYPTION_KEY must be at least 32 characters');
  process.exit(1);
}

if (!process.env.BOT_TOKEN.match(/^\d+:[a-zA-Z0-9_-]+$/)) {
  console.error('❌ BOT_TOKEN has invalid format');
  process.exit(1);
}

console.log('✅ All validations passed');
console.log('🏃 Starting application from src/app.js...');

// ==================== PRODUCTION ERROR HANDLING ====================

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  setTimeout(() => process.exit(1), 1000);
});

// ==================== START APPLICATION ====================

try {
  require('./src/app.js');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
}