// start-railway.js - PRODUCTION VERSION
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');
console.log('🔧 PRODUCTION: Using Railway environment variables');

// Validate critical environment variables
const requiredVars = [
  'BOT_TOKEN',
  'ENCRYPTION_KEY', 
  'DATABASE_URL',
  'MAIN_BOT_NAME'
];

console.log('🔍 Validating environment variables...');
let allSet = true;

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    console.error(`❌ ${varName}: NOT SET`);
    allSet = false;
  } else {
    // Mask sensitive values for logging
    const displayValue = varName.includes('TOKEN') || varName.includes('KEY') 
      ? '***' + value.slice(-4)
      : value;
    console.log(`✅ ${varName}: SET (${displayValue})`);
  }
});

if (!allSet) {
  console.error('\n💥 CRITICAL: Missing required environment variables');
  console.error('💡 Please set these in Railway project → Settings → Variables:');
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      console.error(`   - ${varName}`);
    }
  });
  process.exit(1);
}

// Validate BOT_TOKEN format
const botToken = process.env.BOT_TOKEN;
if (!botToken.match(/^\d+:[a-zA-Z0-9_-]+$/)) {
  console.error('❌ BOT_TOKEN: Invalid format. Should be: 1234567890:ABCdefGHIjkl...');
  process.exit(1);
}

// Validate ENCRYPTION_KEY length
const encryptionKey = process.env.ENCRYPTION_KEY;
if (encryptionKey.length < 32) {
  console.error('❌ ENCRYPTION_KEY: Too short. Minimum 32 characters required.');
  process.exit(1);
}

console.log('✅ All environment variables validated successfully');
console.log('🏃 Starting application from src/app.js...');

// Enable production error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

try {
  require('./src/app.js');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
}