// start-railway.js - PRODUCTION VERSION
console.log('🚀 MarCreatorBot - Production Startup');
console.log('=====================================');
console.log('🔧 Using Railway Environment Variables');

// Validate critical environment variables
const requiredEnvVars = ['BOT_TOKEN', 'DATABASE_URL', 'ENCRYPTION_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('💡 Please set these in your Railway project variables');
  process.exit(1);
}

console.log('✅ Environment variables validated:');
console.log(`   BOT_TOKEN: ${process.env.BOT_TOKEN ? '***' + process.env.BOT_TOKEN.slice(-6) : 'MISSING'}`);
console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '***' + process.env.DATABASE_URL.split('@')[1] : 'MISSING'}`);
console.log(`   ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? 'SET' : 'MISSING'}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'production'}`);
console.log(`   PORT: ${process.env.PORT || 8080}`);

// Test Telegram connection
const testTelegramConnection = async () => {
  try {
    console.log('📡 Testing Telegram API connection...');
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getMe`);
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Telegram API connection SUCCESSFUL:');
      console.log(`   Bot: @${data.result.username} (${data.result.first_name})`);
      console.log(`   ID: ${data.result.id}`);
    } else {
      console.error('❌ Telegram API connection FAILED:');
      console.error(`   Error: ${data.description} (Code: ${data.error_code})`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Network error testing Telegram API:');
    console.error(`   Error: ${error.message}`);
    console.log('⚠️  Continuing startup despite network error...');
  }
};

// Start application
(async () => {
  await testTelegramConnection();
  
  console.log('🏃 Starting main application...');
  console.log('🤖 Expected behavior:');
  console.log('   1. Main bot connects to Telegram');
  console.log('   2. Database connection established');
  console.log('   3. Mini-bots initialize automatically');
  console.log('   4. Health checks start running');
  
  try {
    // Import and start the main application
    const { startApplication } = require('./src/app.js');
    await startApplication();
    
    console.log('✅ Application started successfully!');
    console.log('🎉 MarCreatorBot is now LIVE in production!');
    
  } catch (error) {
    console.error('❌ Failed to start application:');
    console.error(`   Error: ${error.message}`);
    console.error('   Stack trace:', error.stack);
    process.exit(1);
  }
})();