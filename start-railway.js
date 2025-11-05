console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');
console.log('🔧 CRITICAL: This version includes fixes for mini-bot persistence');

// Check critical environment variables
const required = ['DATABASE_URL', 'BOT_TOKEN', 'ENCRYPTION_KEY'];
let allSet = true;

required.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ ${varName}: NOT SET`);
    allSet = false;
  } else {
    console.log(`✅ ${varName}: SET (${process.env[varName].length} chars)`);
  }
});

if (!allSet) {
  console.error('💥 Missing required environment variables');
  process.exit(1);
}

console.log('✅ All environment variables are set');
console.log('🏃 Starting application from src/app.js...');

try {
  require('./src/app.js');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
}