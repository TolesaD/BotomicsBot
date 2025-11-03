// Railway Startup Script
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');
console.log('🔧 CRITICAL: This version includes fixes for mini-bot persistence');

// Set basic environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || 8080;

console.log(`✅ NODE_ENV is set: ${process.env.NODE_ENV}`);
console.log(`✅ PORT is set: ${process.env.PORT}`);

// Check environment variables
const missingVars = [];

if (!process.env.BOT_TOKEN) {
  missingVars.push('BOT_TOKEN');
  console.error('❌ BOT_TOKEN: Missing - Your main bot token from BotFather');
}

if (!process.env.ENCRYPTION_KEY) {
  missingVars.push('ENCRYPTION_KEY');
  console.error('❌ ENCRYPTION_KEY: Missing - A 32-character random string for encryption');
}

if (!process.env.DATABASE_URL) {
  missingVars.push('DATABASE_URL');
  console.error('❌ DATABASE_URL: Missing - PostgreSQL database URL (auto-provided by Railway)');
}

if (missingVars.length > 0) {
  console.error('\n💡 HOW TO FIX:');
  console.error('   1. Go to your Railway project dashboard: https://railway.app');
  console.error('   2. Click on your project');
  console.error('   3. Go to the "Variables" tab');
  console.error('   4. Add the missing variables');
  console.error('   5. Railway will automatically redeploy');
  
  process.exit(1);
}

console.log('✅ All environment variables are set');
console.log('🏃 Starting application...');

// Start the main application
require('./app.js');