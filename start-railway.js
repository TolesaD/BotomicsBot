// start-railway.js - RAILWAY NATIVE
console.log('🚀 MarCreatorBot - Railway Native Mode');
console.log('=====================================');

// Railway automatically provides these
console.log('🔍 Railway Auto-Provisioned:');
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? 'AUTO-PROVIDED' : 'MISSING');
console.log('   RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
console.log('   RAILWAY_STATIC_URL:', process.env.RAILWAY_STATIC_URL);

// Check only what Railway should provide
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not provided by Railway');
  console.error('💡 Railway should auto-provision this');
  process.exit(1);
}

// Check user-provided variables
const userVars = ['BOT_TOKEN', 'ENCRYPTION_KEY'];
const missingUserVars = userVars.filter(varName => !process.env[varName]);

if (missingUserVars.length > 0) {
  console.error('❌ User variables missing:', missingUserVars.join(', '));
  console.error('\n🚨 HOW TO FIX IN RAILWAY:');
  console.error('   1. Go to your SERVICE (click on service name)');
  console.error('   2. Settings → Variables');
  console.error('   3. Add these EXACT names:');
  missingUserVars.forEach(varName => console.error(`      - ${varName}`));
  console.error('   4. Make sure they are at SERVICE level (not Project)');
  console.error('   5. Redeploy after adding');
  process.exit(1);
}

console.log('✅ All variables available');
console.log('🏃 Starting application...');

require('./src/app.js');