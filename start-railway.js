// start-railway.js - Updated to use config
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('==================================');

// Load config FIRST
const config = require('./config/environment');

// Now check critical environment variables through config
console.log('🔍 Environment Check:');

if (config.DATABASE_URL) {
  console.log('✅ DATABASE_URL is set - PostgreSQL connected');
  console.log('✅ Mini-bots will persist across deployments');
} else {
  console.log('❌ DATABASE_URL not set - PostgreSQL database not connected');
  console.log('🚨 CRITICAL: Mini-bots will NOT persist across deployments!');
  console.log('💡 Solution: Add PostgreSQL database in Railway Dashboard');
  console.log('   Railway → New → Database → PostgreSQL');
}

if (!config.BOT_TOKEN) {
  console.log('❌ BOT_TOKEN not set');
  // Don't set defaults here - let the config handle it
} else {
  console.log('✅ BOT_TOKEN is set');
}

if (!config.ENCRYPTION_KEY) {
  console.log('❌ ENCRYPTION_KEY not set');
  // Don't set defaults here - let the config handle it
} else {
  console.log('✅ ENCRYPTION_KEY is set');
}

console.log('✅ Starting application...');

require('./src/app.js');