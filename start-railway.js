// start-railway.js - DEBUG VERSION
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');
console.log('🔧 DEBUG: Checking Railway environment variables');

// Debug: List all environment variables (for debugging)
console.log('\n🔍 ALL ENVIRONMENT VARIABLES:');
Object.keys(process.env).forEach(key => {
  if (key.includes('BOT') || key.includes('KEY') || key.includes('DATABASE') || key.includes('MAIN')) {
    const value = process.env[key];
    const displayValue = key.includes('TOKEN') || key.includes('KEY') 
      ? '***' + (value ? value.slice(-4) : 'NULL')
      : value || 'NULL';
    console.log(`   ${key}: ${displayValue}`);
  }
});

// Check specific variable names that Railway might use
console.log('\n🔍 CHECKING COMMON RAILWAY VARIABLE NAMES:');
const commonVarNames = [
  'BOT_TOKEN',
  'ENCRYPTION_KEY', 
  'DATABASE_URL',
  'MAIN_BOT_NAME',
  'RAILWAY_DATABASE_URL', // Railway sometimes uses this
  'DATABASE_PRIVATE_URL', // Another common Railway name
  'DATABASE_CONNECTION_URL'
];

commonVarNames.forEach(varName => {
  const value = process.env[varName];
  console.log(`   ${varName}: ${value ? 'SET (' + value.length + ' chars)' : 'NOT SET'}`);
});

// Try to find DATABASE_URL from common Railway variable names
const databaseUrl = process.env.DATABASE_URL || 
                   process.env.RAILWAY_DATABASE_URL || 
                   process.env.DATABASE_PRIVATE_URL ||
                   process.env.DATABASE_CONNECTION_URL;

console.log('\n🔍 FINAL DATABASE_URL RESOLUTION:');
console.log(`   Using DATABASE_URL: ${databaseUrl ? 'SET (' + databaseUrl.length + ' chars)' : 'NOT SET'}`);

// Flexible variable resolution
const resolvedVars = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_URL: databaseUrl,
  MAIN_BOT_NAME: process.env.MAIN_BOT_NAME || 'MarCreatorBot'
};

console.log('\n🔍 RESOLVED VARIABLES:');
Object.keys(resolvedVars).forEach(key => {
  const value = resolvedVars[key];
  const displayValue = key.includes('TOKEN') || key.includes('KEY') 
    ? '***' + (value ? value.slice(-4) : 'NULL')
    : value || 'NULL';
  console.log(`   ${key}: ${value ? 'SET' : 'NOT SET'} (${displayValue})`);
});

// Check if we have the minimum required variables
const hasRequiredVars = resolvedVars.BOT_TOKEN && resolvedVars.ENCRYPTION_KEY && resolvedVars.DATABASE_URL;

if (!hasRequiredVars) {
  console.error('\n💥 CRITICAL: Missing required environment variables');
  console.error('💡 Railway Variables Setup Guide:');
  console.error('   1. Go to your Railway project');
  console.error('   2. Click on your SERVICE (not project)');
  console.error('   3. Go to "Variables" tab');
  console.error('   4. Add these variables:');
  console.error('      - BOT_TOKEN: your_bot_token_here');
  console.error('      - ENCRYPTION_KEY: your_32_char_encryption_key');
  console.error('      - DATABASE_URL: your_database_url');
  console.error('      - MAIN_BOT_NAME: MarCreatorBot (optional)');
  console.error('   5. Redeploy after setting variables');
  process.exit(1);
}

console.log('\n✅ All required variables found!');
console.log('🏃 Starting application from src/app.js...');

// Set the resolved variables to process.env for the app to use
if (resolvedVars.DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolvedVars.DATABASE_URL;
}
if (resolvedVars.MAIN_BOT_NAME && !process.env.MAIN_BOT_NAME) {
  process.env.MAIN_BOT_NAME = resolvedVars.MAIN_BOT_NAME;
}

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