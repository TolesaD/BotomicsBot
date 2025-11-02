// debug-env.js
console.log('🚀 DEBUG: Checking Railway Environment Variables');
console.log('===============================================');

// Check critical variables
const criticalVars = [
  'BOT_TOKEN',
  'ENCRYPTION_KEY', 
  'DATABASE_DIALECT',
  'NODE_ENV',
  'DATABASE_URL',
  'PORT'
];

console.log('\n🔍 Critical Environment Variables:');
criticalVars.forEach(key => {
  const value = process.env[key];
  console.log(`   ${key}: ${value ? '✅ SET' : '❌ NOT SET'}`);
  if (value && key.includes('TOKEN') || key.includes('KEY')) {
    console.log(`      Value: ${value.substring(0, 10)}...${value.substring(value.length - 4)}`);
  } else if (value) {
    console.log(`      Value: ${value}`);
  }
});

console.log('\n📋 All Environment Variables:');
Object.keys(process.env).forEach(key => {
  console.log(`   ${key}: ${process.env[key] ? process.env[key].substring(0, 20) + '...' : 'NOT SET'}`);
});

console.log('\n===============================================');