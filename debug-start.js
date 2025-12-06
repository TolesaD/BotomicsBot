console.log('🔍 COMPLETE VARIABLE CHECK');
console.log('===========================');

// Check all variables from your .env
const checkVars = {
  // REQUIRED - App won't start without these
  CRITICAL: ['BOT_TOKEN', 'DATABASE_URL', 'ENCRYPTION_KEY'],
  
  // IMPORTANT - App will work but with defaults
  IMPORTANT: ['MAIN_BOT_USERNAME', 'PORT', 'NODE_ENV', 'HOST', 'PLATFORM_CREATOR_ID'],
  
  // OPTIONAL - Features might not work
  OPTIONAL: ['MAX_BOTS_PER_USER', 'ENABLE_WALLET_SYSTEM', 'ENABLE_PREMIUM_SUBSCRIPTIONS',
             'BOTOMICS_PREMIUM_PRICE', 'BOTOMICS_MIN_WITHDRAWAL']
};

// Check Railway's DATABASE_PUBLIC_URL
if (process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL) {
  console.log('📝 DATABASE_PUBLIC_URL found but DATABASE_URL missing');
  console.log('   Using DATABASE_PUBLIC_URL as DATABASE_URL');
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

// Log all variables
Object.entries(checkVars).forEach(([category, vars]) => {
  console.log(`\n${category} VARIABLES:`);
  vars.forEach(varName => {
    const value = process.env[varName];
    console.log(`  ${varName}: ${value ? '✅ SET' : '❌ NOT SET'}`);
  });
});

// Check Railway auto variables
console.log('\nRAILWAY AUTO VARIABLES:');
console.log('  RAILWAY_STATIC_URL:', process.env.RAILWAY_STATIC_URL || 'NOT SET');
console.log('  DATABASE_PUBLIC_URL:', process.env.DATABASE_PUBLIC_URL || 'NOT SET');

// Build WALLET_URL and APP_URL from Railway
if (process.env.RAILWAY_STATIC_URL) {
  if (!process.env.WALLET_URL) {
    process.env.WALLET_URL = `${process.env.RAILWAY_STATIC_URL}/wallet`;
    console.log('📝 Auto-setting WALLET_URL:', process.env.WALLET_URL);
  }
  if (!process.env.APP_URL) {
    process.env.APP_URL = process.env.RAILWAY_STATIC_URL;
    console.log('📝 Auto-setting APP_URL:', process.env.APP_URL);
  }
}

// Check if we can start
const missingCritical = checkVars.CRITICAL.filter(v => !process.env[v]);
if (missingCritical.length === 0) {
  console.log('\n✅ All critical variables found! Starting main app...');
  require('./src/app.js');
} else {
  console.log('\n❌ Missing critical variables:', missingCritical);
  console.log('💡 Add these in Railway Dashboard → Variables');
  
  // Keep debug server running
  const http = require('http');
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'debug_mode',
      missing: missingCritical,
      all_vars: Object.keys(process.env).sort(),
      help: 'Add missing variables in Railway Dashboard'
    }));
  }).listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log(`🔧 Debug server running on port ${process.env.PORT || 3000}`);
  });
}