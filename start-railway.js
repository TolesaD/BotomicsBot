// start-railway.js - TEMPORARY WORKAROUND
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');

// Debug Railway environment
console.log('🔍 Railway Environment:');
console.log('   RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
console.log('   RAILWAY_SERVICE_NAME:', process.env.RAILWAY_SERVICE_NAME);

// Check if we're actually on Railway
const isOnRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME;

if (!isOnRailway) {
  console.error('❌ NOT RUNNING ON RAILWAY - Environment missing Railway variables');
}

// Check required variables
const requiredVars = ['BOT_TOKEN', 'DATABASE_URL', 'ENCRYPTION_KEY'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Railway Variables Issue:');
  console.error('   Missing:', missingVars.join(', '));
  console.error('');
  console.error('🚨 IMMEDIATE FIX REQUIRED:');
  console.error('   1. Go to Railway → Your SERVICE (click on service name)');
  console.error('   2. Settings → Variables');
  console.error('   3. Add these EXACT variable names:');
  console.error('      - BOT_TOKEN');
  console.error('      - DATABASE_URL');
  console.error('      - ENCRYPTION_KEY');
  console.error('   4. Make sure they are at SERVICE level, not Project level');
  console.error('   5. Redeploy after adding variables');
  console.error('');
  console.error('💡 Current Service:', process.env.RAILWAY_SERVICE_NAME || 'UNKNOWN');
  
  // Don't exit - let the app try to start anyway for debugging
  console.log('⚠️  Continuing startup for debugging...');
}

console.log('🏃 Starting application...');

try {
  require('./src/app.js');
} catch (error) {
  console.error('❌ Application failed:', error.message);
}