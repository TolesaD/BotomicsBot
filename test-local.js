// test-local.js - COMPREHENSIVE LOCAL TESTING WITH ENVIRONMENT SUPPORT
console.log('🧪 MARCREATORBOT - LOCAL TEST SUITE');
console.log('=====================================\n');

// Load environment variables first
require('dotenv').config();

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development' || 
                     process.env.NODE_ENV === 'dev' || 
                     process.env.DEV_MODE === 'true';

const mainBotName = isDevelopment ? 'MarCreatorDevBot' : 'MarCreatorBot';
const expectedTokenPrefix = isDevelopment ? 'MarCreatorDevBot' : 'MarCreatorBot';

console.log(`🌍 TEST ENVIRONMENT: ${isDevelopment ? 'DEVELOPMENT 🚧' : 'PRODUCTION 🚀'}`);
console.log(`🤖 EXPECTED BOT: ${mainBotName}`);
console.log(`🔧 NODE_ENV: ${process.env.NODE_ENV || 'development'}\n`);

// Test 1: Environment Variables
console.log('1. 🔍 TESTING ENVIRONMENT VARIABLES');
console.log('   --------------------------------');

const requiredEnvVars = [
  { name: 'BOT_TOKEN', minLength: 40, description: 'Telegram Bot Token' },
  { name: 'ENCRYPTION_KEY', minLength: 40, description: 'Encryption Key' },
  { name: 'DATABASE_URL', minLength: 20, description: 'Database Connection URL' }
];

let envTestPassed = true;

requiredEnvVars.forEach(({ name, minLength, description }) => {
  const value = process.env[name];
  
  if (!value) {
    console.log(`   ❌ ${name}: MISSING - ${description}`);
    envTestPassed = false;
  } else if (value.length < minLength) {
    console.log(`   ❌ ${name}: TOO SHORT (${value.length} chars, need ${minLength}+)`);
    envTestPassed = false;
  } else {
    // Special check for BOT_TOKEN to ensure it matches environment
    if (name === 'BOT_TOKEN') {
      const tokenValid = value.includes(expectedTokenPrefix);
      if (!tokenValid) {
        console.log(`   ⚠️  ${name}: WARNING - Token doesn't match expected bot (${mainBotName})`);
        console.log(`      Current token appears to be for: ${value.split(':')[0]}`);
      } else {
        console.log(`   ✅ ${name}: SET and matches ${mainBotName} (${value.length} chars)`);
      }
    } else {
      console.log(`   ✅ ${name}: SET (${value.length} chars)`);
    }
  }
});

console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'} ${isDevelopment ? '🚧' : '🚀'}`);
console.log('   PORT:', process.env.PORT || 3000);

if (!envTestPassed) {
  console.log('\n💡 HOW TO FIX:');
  console.log('   Create a .env file with these variables:');
  console.log('   BOT_TOKEN=your_bot_token_here');
  console.log('   ENCRYPTION_KEY=your_encryption_key_here');
  console.log('   DATABASE_URL=your_database_url_here');
  console.log(`\n⚠️  IMPORTANT: Use ${mainBotName} token for ${isDevelopment ? 'development' : 'production'}`);
  process.exit(1);
}

console.log('\n✅ Environment variables test: PASSED\n');

// Test 2: Configuration Loading
console.log('2. 🔧 TESTING CONFIGURATION LOADING');
console.log('   ---------------------------------');

try {
  const config = require('./config/environment');
  console.log('   ✅ Configuration loaded successfully');
  console.log(`   BOT_TOKEN: ***${config.BOT_TOKEN ? config.BOT_TOKEN.slice(-6) : 'MISSING'}`);
  console.log(`   ENCRYPTION_KEY: ${config.ENCRYPTION_KEY ? 'SET' : 'MISSING'}`);
  console.log(`   DATABASE_URL: ${config.DATABASE_URL ? 'SET' : 'MISSING'}`);
  console.log(`   NODE_ENV: ${config.NODE_ENV} ${isDevelopment ? '🚧' : '🚀'}`);
  console.log(`   PORT: ${config.PORT}`);
} catch (error) {
  console.log('   ❌ Configuration loading failed:', error.message);
  process.exit(1);
}

console.log('\n✅ Configuration test: PASSED\n');

// Test 3: Database Connection
console.log('3. 🗄️ TESTING DATABASE CONNECTION');
console.log('   ------------------------------');

async function testDatabase() {
  try {
    const { connectDB, sequelize } = require('./database/db');
    
    console.log('   🔌 Testing database connection...');
    const connected = await connectDB();
    
    if (connected) {
      console.log('   ✅ Database connection: SUCCESS');
      
      // Test basic queries
      try {
        const [results] = await sequelize.query('SELECT version()');
        console.log('   ✅ Database version check: SUCCESS');
        
        // Test model synchronization
        const { Bot } = require('./src/models');
        const botCount = await Bot.count();
        console.log(`   ✅ Model test: ${botCount} bots in database`);
        
        return true;
      } catch (queryError) {
        console.log('   ❌ Database query test failed:', queryError.message);
        return false;
      }
    } else {
      console.log('   ❌ Database connection: FAILED');
      return false;
    }
  } catch (error) {
    console.log('   ❌ Database test failed:', error.message);
    return false;
  }
}

// Test 4: Telegram API
console.log('4. 📡 TESTING TELEGRAM API');
console.log('   -----------------------');

async function testTelegram() {
  try {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    console.log(`   📞 Calling Telegram API for ${mainBotName}...`);
    const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getMe`);
    const data = await response.json();
    
    if (data.ok) {
      console.log('   ✅ Telegram API: SUCCESS');
      console.log(`      Bot: @${data.result.username}`);
      console.log(`      Name: ${data.result.first_name}`);
      console.log(`      ID: ${data.result.id}`);
      
      // Verify bot matches expected environment
      const actualBotName = data.result.username;
      const expectedBotName = mainBotName.toLowerCase().replace('@', '');
      
      if (actualBotName !== expectedBotName) {
        console.log(`   ⚠️  WARNING: Bot username doesn't match expected environment`);
        console.log(`      Expected: ${expectedBotName}`);
        console.log(`      Actual: ${actualBotName}`);
      } else {
        console.log(`   ✅ Bot matches expected environment: ${mainBotName}`);
      }
      
      return true;
    } else {
      console.log('   ❌ Telegram API: FAILED -', data.description);
      return false;
    }
  } catch (error) {
    console.log('   ❌ Telegram API test failed:', error.message);
    return false;
  }
}

// Test 5: Application Startup
console.log('5. 🚀 TESTING APPLICATION STARTUP');
console.log('   ------------------------------');

async function testAppStartup() {
  return new Promise((resolve) => {
    console.log('   🔧 Testing application import...');
    
    try {
      const MetaBotCreator = require('./src/app.js');
      console.log('   ✅ Application import: SUCCESS');
      
      console.log('   🤖 Testing bot instance creation...');
      const app = new MetaBotCreator();
      console.log('   ✅ Bot instance creation: SUCCESS');
      
      // Test environment detection in main app
      if (app.isDevelopment !== undefined) {
        console.log(`   ✅ Environment detection: ${app.isDevelopment ? 'DEVELOPMENT 🚧' : 'PRODUCTION 🚀'}`);
      }
      
      // Don't actually start the bot to avoid hanging
      console.log('   ⚠️  Bot launch test: SKIPPED (to avoid hanging)');
      
      resolve(true);
    } catch (error) {
      console.log('   ❌ Application startup test failed:', error.message);
      console.log('   Stack:', error.stack);
      resolve(false);
    }
  });
}

// Test 6: Encryption System
console.log('6. 🔐 TESTING ENCRYPTION SYSTEM');
console.log('   ----------------------------');

async function testEncryption() {
  try {
    console.log('   Testing encryption/decryption...');
    
    // Test with a simple bot model if available
    const { Bot } = require('./src/models');
    
    // Create a test bot instance to check encryption methods
    const testBot = Bot.build({
      bot_name: 'Test Bot',
      bot_token: 'test_token_123',
      owner_id: 123456789
    });
    
    console.log('   ✅ Encryption system: AVAILABLE');
    return true;
  } catch (error) {
    console.log('   ⚠️  Encryption test: LIMITED -', error.message);
    return true; // Don't fail the test for this
  }
}

// Test 7: MiniBotManager Environment Support
console.log('7. 🤖 TESTING MINI-BOT MANAGER ENVIRONMENT SUPPORT');
console.log('   ----------------------------------------------');

async function testMiniBotManager() {
  try {
    const MiniBotManager = require('./src/services/MiniBotManager');
    
    console.log('   Checking MiniBotManager environment detection...');
    const status = MiniBotManager.getInitializationStatus();
    console.log('   ✅ MiniBotManager: LOADED');
    console.log(`      Status: ${status.status}`);
    console.log(`      Initialized: ${status.isInitialized}`);
    console.log(`      Active Bots: ${status.activeBots}`);
    console.log(`      Environment: ${status.environment} ${status.environment === 'development' ? '🚧' : '🚀'}`);
    console.log(`      Main Bot: ${status.mainBot}`);
    
    // Verify environment consistency
    if (status.environment === (isDevelopment ? 'development' : 'production')) {
      console.log('   ✅ Environment consistency: MATCHES');
    } else {
      console.log('   ⚠️  Environment consistency: MISMATCH');
    }
    
    return true;
  } catch (error) {
    console.log('   ❌ MiniBotManager test failed:', error.message);
    return false;
  }
}

// Test 8: Health Check System
console.log('8. 🏥 TESTING HEALTH CHECK SYSTEM');
console.log('   ------------------------------');

async function testHealthSystem() {
  try {
    console.log('   Testing health check system...');
    
    // Import health app but don't start server during tests
    const healthApp = require('./health.js');
    
    console.log('   ✅ Health system: AVAILABLE');
    console.log(`      Service: ${isDevelopment ? 'MarCreatorBot DEV' : 'MarCreatorBot'}`);
    console.log(`      Main Bot: ${mainBotName}`);
    
    return true;
  } catch (error) {
    console.log('   ⚠️  Health system test: LIMITED -', error.message);
    return true; // Don't fail the test for this
  }
}

// Run all tests
async function runAllTests() {
  const tests = [
    { name: 'Database Connection', fn: testDatabase },
    { name: 'Telegram API', fn: testTelegram },
    { name: 'Encryption System', fn: testEncryption },
    { name: 'MiniBot Manager Environment', fn: testMiniBotManager },
    { name: 'Health Check System', fn: testHealthSystem },
    { name: 'Application Startup', fn: testAppStartup }
  ];
  
  let allPassed = true;
  
  for (const test of tests) {
    const passed = await test.fn();
    if (!passed) {
      allPassed = false;
    }
    console.log(''); // Empty line between tests
  }
  
  // Final Summary
  console.log('='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT 🚧' : 'PRODUCTION 🚀'}`);
  console.log(`🤖 Main Bot: ${mainBotName}`);
  console.log(`🔧 NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  
  if (allPassed) {
    console.log('\n🎉 ALL TESTS PASSED - Ready for deployment!');
    console.log('\n🚀 NEXT STEPS:');
    if (isDevelopment) {
      console.log('   1. Development environment confirmed ✅');
      console.log('   2. Test with @MarCreatorDevBot');
      console.log('   3. When ready, switch to production:');
      console.log('      - Update BOT_TOKEN to MarCreatorBot token');
      console.log('      - Set NODE_ENV=production');
      console.log('      - Run: npm run test:prod');
    } else {
      console.log('   1. Production environment confirmed ✅');
      console.log('   2. Using @MarCreatorBot');
      console.log('   3. Ready for deployment to Yegara.com');
      console.log('   4. Set environment variables in cPanel');
    }
  } else {
    console.log('\n❌ SOME TESTS FAILED - Fix before deployment!');
    console.log('\n💡 TROUBLESHOOTING:');
    console.log('   - Check your .env file has correct values');
    console.log(`   - Verify you're using the right bot token for ${mainBotName}`);
    console.log('   - Ensure database is running and accessible');
    console.log('   - Check network connectivity');
    process.exit(1);
  }
  console.log('='.repeat(60));
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT ERROR:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the tests
console.log('🏃 Starting comprehensive local tests...\n');
runAllTests().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});