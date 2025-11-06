// start-railway.js - TEMPORARY FIX
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');

// TEMPORARY: Fallback values for debugging
const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || '7983296108:AAH8Dj_5WfhPN7g18jFI2VsexzJAiCjPgpI',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:kLpoExiXkvPvBYaSERToYbaavbHiawPs@trolley.proxy.rlwy.net:43180/railway',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'W370NNal3+hm8KmDwQVOd2tzhW8S5Ma+Fk8MvVMK5QU='
};

console.log('🔍 Environment Debug:');
console.log('   process.env.BOT_TOKEN:', process.env.BOT_TOKEN ? 'SET' : 'NOT SET');
console.log('   process.env.DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('   process.env.ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? 'SET' : 'NOT SET');

// Set fallback values if Railway variables aren't loaded
if (!process.env.BOT_TOKEN) {
  console.log('⚠️  Using fallback BOT_TOKEN (Railway variable not loaded)');
  process.env.BOT_TOKEN = config.BOT_TOKEN;
}
if (!process.env.DATABASE_URL) {
  console.log('⚠️  Using fallback DATABASE_URL (Railway variable not loaded)');
  process.env.DATABASE_URL = config.DATABASE_URL;
}
if (!process.env.ENCRYPTION_KEY) {
  console.log('⚠️  Using fallback ENCRYPTION_KEY (Railway variable not loaded)');
  process.env.ENCRYPTION_KEY = config.ENCRYPTION_KEY;
}

console.log('✅ Proceeding with startup...');

// Start application
(async () => {
  console.log('🏃 Starting application...');
  
  try {
    const { startApplication } = require('./src/app.js');
    await startApplication();
    
    console.log('✅ MarCreatorBot is now RUNNING!');
    
  } catch (error) {
    console.error('❌ Startup failed:', error.message);
    process.exit(1);
  }
})();