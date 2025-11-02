// start-railway.js - Updated for Railway
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('==================================');

// Check critical environment variables
console.log('🔍 Environment Check:');

if (!process.env.DATABASE_URL) {
  console.log('❌ DATABASE_URL not set - PostgreSQL database not connected');
  console.log('🚨 CRITICAL: Mini-bots will NOT persist across deployments!');
  console.log('💡 Solution: Add PostgreSQL database in Railway Dashboard');
  console.log('   Railway → New → Database → PostgreSQL');
} else {
  console.log('✅ DATABASE_URL is set - PostgreSQL connected');
  console.log('✅ Mini-bots will persist across deployments');
}

if (!process.env.BOT_TOKEN) {
  console.log('❌ BOT_TOKEN not set');
  process.env.BOT_TOKEN = '7983296108:AAH8Dj_5WfhPN7g18jFI2VsexzJAiCjPgpI';
  console.log('⚠️  Using default BOT_TOKEN');
} else {
  console.log('✅ BOT_TOKEN is set');
}

if (!process.env.ENCRYPTION_KEY) {
  console.log('❌ ENCRYPTION_KEY not set');
  process.env.ENCRYPTION_KEY = '7a89253d1236bb589c247a236f676401cb681fcf2d45345efe38180ce70abf23';
  console.log('⚠️  Using default ENCRYPTION_KEY');
} else {
  console.log('✅ ENCRYPTION_KEY is set');
}

console.log('✅ Starting application...');

require('./src/app.js');