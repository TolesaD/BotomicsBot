// NUCLEAR SOLUTION - Hardcoded Environment Variables
console.log('💥 NUCLEAR MODE: Using hardcoded environment variables');

// HARDCODED VALUES - Replace these with your actual values
const HARDCODED_CONFIG = {
  BOT_TOKEN: "7983296108:AAH8Dj_5WfhPN7g18jFI2VsexzJAiCjPgpI",
  ENCRYPTION_KEY: "W370NNal3+hm8KmDwQVOd2tzhW8S5Ma+Fk8MvVMK5QU=",
  DATABASE_URL: "postgresql://postgres:kLpoExiXkvPvBYaSERToYbaavbHiawPs@trolley.proxy.rlwy.net:43180/railway",
  NODE_ENV: "production",
  PORT: "8080"
};

// Inject hardcoded values into process.env
Object.keys(HARDCODED_CONFIG).forEach(key => {
  process.env[key] = HARDCODED_CONFIG[key];
});

console.log('✅ HARDCODED Environment Variables:');
console.log('   BOT_TOKEN: SET (' + process.env.BOT_TOKEN.length + ' chars)');
console.log('   ENCRYPTION_KEY: SET (' + process.env.ENCRYPTION_KEY.length + ' chars)');
console.log('   DATABASE_URL: SET (' + process.env.DATABASE_URL.length + ' chars)');
console.log('   DATABASE_URL verified: ' + (process.env.DATABASE_URL.includes('postgres') ? '✅ PostgreSQL' : '❌ Not PostgreSQL'));

console.log('🚀 Starting MarCreatorBot with hardcoded configuration...');

// Fix package.json module issue by using dynamic import
import('./src/app.js').catch(error => {
  console.error('💥 Failed to start application:', error);
  process.exit(1);
});