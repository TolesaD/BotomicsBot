// start-railway.js - ENHANCED DEBUG
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');
console.log('🔧 ENHANCED DEBUG: Railway Environment Analysis');

// Get all environment variables
const allEnvVars = process.env;
console.log('\n📋 ALL AVAILABLE ENVIRONMENT VARIABLES:');
Object.keys(allEnvVars)
  .sort()
  .forEach(key => {
    const value = allEnvVars[key];
    // Show all variables, but mask sensitive ones
    if (key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET') || key.includes('PASSWORD')) {
      console.log(`   ${key}: ***${value ? value.slice(-4) : 'NULL'}`);
    } else {
      console.log(`   ${key}: ${value || 'NULL'}`);
    }
  });

// Check for common Railway variable patterns
console.log('\n🔍 CHECKING RAILWAY SPECIFIC VARIABLES:');
const railwayVars = Object.keys(allEnvVars).filter(key => 
  key.includes('RAILWAY') || 
  key.includes('DATABASE') || 
  key.includes('BOT') || 
  key.includes('ENCRYPTION') ||
  key.includes('TOKEN')
);

railwayVars.forEach(key => {
  const value = allEnvVars[key];
  const displayValue = key.includes('TOKEN') || key.includes('KEY') 
    ? '***' + (value ? value.slice(-4) : 'NULL')
    : value || 'NULL';
  console.log(`   ${key}: ${displayValue}`);
});

// Check if we're running in Railway
console.log('\n🏗️  RAILWAY ENVIRONMENT CHECK:');
console.log(`   RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT || 'NOT SET'}`);
console.log(`   RAILWAY_SERVICE_NAME: ${process.env.RAILWAY_SERVICE_NAME || 'NOT SET'}`);
console.log(`   RAILWAY_PROJECT_NAME: ${process.env.RAILWAY_PROJECT_NAME || 'NOT SET'}`);
console.log(`   RAILWAY_GIT_COMMIT_SHA: ${process.env.RAILWAY_GIT_COMMIT_SHA || 'NOT SET'}`);

// Try to resolve variables with different naming strategies
console.log('\n🔄 ATTEMPTING VARIABLE RESOLUTION:');

// Strategy 1: Direct access
const botToken = process.env.BOT_TOKEN;
console.log(`   Strategy 1 - BOT_TOKEN: ${botToken ? 'FOUND' : 'NOT FOUND'}`);

// Strategy 2: Case insensitive search
const caseInsensitiveVars = {};
Object.keys(allEnvVars).forEach(key => {
  caseInsensitiveVars[key.toLowerCase()] = allEnvVars[key];
});

const botTokenLower = caseInsensitiveVars['bot_token'];
console.log(`   Strategy 2 - bot_token (lowercase): ${botTokenLower ? 'FOUND' : 'NOT FOUND'}`);

// Strategy 3: Pattern matching
const tokenVars = Object.keys(allEnvVars).filter(key => 
  key.toLowerCase().includes('token') && 
  !key.toLowerCase().includes('railway')
);
console.log(`   Strategy 3 - Token-like variables: ${tokenVars.join(', ') || 'NONE'}`);

// Final resolution attempt
const resolvedConfig = {
  BOT_TOKEN: process.env.BOT_TOKEN || 
             caseInsensitiveVars['bot_token'] ||
             (tokenVars.length > 0 ? allEnvVars[tokenVars[0]] : null),
  
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 
                  caseInsensitiveVars['encryption_key'] ||
                  process.env.ENCRYPTIONKEY,
  
  DATABASE_URL: process.env.DATABASE_URL || 
                process.env.RAILWAY_DATABASE_URL ||
                process.env.DATABASE_PRIVATE_URL ||
                process.env.DATABASE_CONNECTION_URL,
  
  MAIN_BOT_NAME: process.env.MAIN_BOT_NAME || 'MarCreatorBot'
};

console.log('\n🎯 FINAL RESOLVED CONFIGURATION:');
console.log(`   BOT_TOKEN: ${resolvedConfig.BOT_TOKEN ? 'SET (' + resolvedConfig.BOT_TOKEN.length + ' chars)' : 'NOT SET'}`);
console.log(`   ENCRYPTION_KEY: ${resolvedConfig.ENCRYPTION_KEY ? 'SET (' + resolvedConfig.ENCRYPTION_KEY.length + ' chars)' : 'NOT SET'}`);
console.log(`   DATABASE_URL: ${resolvedConfig.DATABASE_URL ? 'SET (' + resolvedConfig.DATABASE_URL.length + ' chars)' : 'NOT SET'}`);
console.log(`   MAIN_BOT_NAME: ${resolvedConfig.MAIN_BOT_NAME}`);

// Check if we can proceed
const canProceed = resolvedConfig.BOT_TOKEN && resolvedConfig.ENCRYPTION_KEY && resolvedConfig.DATABASE_URL;

if (!canProceed) {
  console.error('\n💥 CRITICAL: Cannot start application - missing required variables');
  console.error('\n🔧 TROUBLESHOOTING STEPS:');
  console.error('   1. Go to Railway → Your Service → Variables');
  console.error('   2. Verify variables are spelled EXACTLY as:');
  console.error('      - BOT_TOKEN');
  console.error('      - ENCRYPTION_KEY'); 
  console.error('      - DATABASE_URL');
  console.error('      - MAIN_BOT_NAME');
  console.error('   3. Check for typos or extra spaces');
  console.error('   4. Try deleting and recreating the variables');
  console.error('   5. Contact Railway support if issue persists');
  
  process.exit(1);
}

// Set resolved config to process.env
console.log('\n✅ All variables resolved successfully!');
Object.keys(resolvedConfig).forEach(key => {
  if (resolvedConfig[key] && !process.env[key]) {
    process.env[key] = resolvedConfig[key];
  }
});

console.log('🏃 Starting application from src/app.js...');

// Start the application
try {
  require('./src/app.js');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
}