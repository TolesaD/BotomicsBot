// Railway Startup Script
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');

// Set environment variables for Railway
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || 8080;

console.log(`✅ NODE_ENV is set: ${process.env.NODE_ENV}...`);
console.log(`✅ PORT is set: ${process.env.PORT}...`);

// Check if we have the required environment variables
const requiredEnvVars = ['BOT_TOKEN', 'ENCRYPTION_KEY', 'DATABASE_URL'];
let allVarsPresent = true;

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`❌ Missing environment variable: ${varName}`);
    allVarsPresent = false;
  }
}

if (!allVarsPresent) {
  console.error('💡 Please set the following environment variables in Railway:');
  console.error('   - BOT_TOKEN: Your main bot token from BotFather');
  console.error('   - ENCRYPTION_KEY: A 32-character encryption key');
  console.error('   - DATABASE_URL: Automatically provided by PostgreSQL addon');
  console.error('');
  console.error('📖 How to fix:');
  console.error('   1. Go to your Railway project dashboard');
  console.error('   2. Click on "Variables"');
  console.error('   3. Add BOT_TOKEN and ENCRYPTION_KEY');
  console.error('   4. Make sure PostgreSQL addon is provisioned');
  process.exit(1);
}

console.log('✅ All environment variables ready');
console.log('🏃 Starting application...');

// Now start the main application
require('./app.js');