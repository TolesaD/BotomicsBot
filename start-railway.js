// Railway Startup Script - Safe Auto-Quoting Version

console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');
console.log('🔧 CRITICAL: This version handles Railway auto-quoting and undefined envs');

// -------------------- Utility: Strip Quotes --------------------
function stripQuotes(value) {
  if (!value || value === 'undefined' || value === 'null') return undefined;
  if (typeof value === 'string') {
    // Remove single or double quotes
    return value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  return value;
}

// -------------------- Normalize Environment Variables --------------------
process.env.BOT_TOKEN = stripQuotes(process.env.BOT_TOKEN);
process.env.ENCRYPTION_KEY = stripQuotes(process.env.ENCRYPTION_KEY);
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.MAIN_BOT_NAME = stripQuotes(process.env.MAIN_BOT_NAME);
process.env.MAIN_BOT_USERNAME = stripQuotes(process.env.MAIN_BOT_USERNAME);

// Fallback for Railway automatic variable
if (!process.env.DATABASE_URL && process.env.RAILWAY_DATABASE_URL) {
  console.log('🔧 Using RAILWAY_DATABASE_URL as fallback');
  process.env.DATABASE_URL = process.env.RAILWAY_DATABASE_URL;
}

// -------------------- Environment Summary --------------------
console.log(`✅ NODE_ENV: ${process.env.NODE_ENV || 'production'}`);
console.log(`✅ PORT: ${process.env.PORT || 8080}`);
console.log(`🔧 BOT_TOKEN length: ${process.env.BOT_TOKEN ? process.env.BOT_TOKEN.length : 'MISSING'}`);
console.log(`🔧 ENCRYPTION_KEY length: ${process.env.ENCRYPTION_KEY ? process.env.ENCRYPTION_KEY.length : 'MISSING'}`);
console.log(`🔧 DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'MISSING'}`);

// -------------------- Validation --------------------
const missingVars = [];
if (!process.env.BOT_TOKEN) missingVars.push('BOT_TOKEN');
if (!process.env.ENCRYPTION_KEY) missingVars.push('ENCRYPTION_KEY');
if (!process.env.DATABASE_URL) missingVars.push('DATABASE_URL');

if (missingVars.length > 0) {
  console.error('\n❌ Missing environment variables:', missingVars.join(', '));
  console.error('💡 HOW TO FIX:');
  console.error('  1. Go to Railway → Variables.');
  console.error('  2. Ensure these keys exist and have values.');
  console.error('  3. If Railway added quotes automatically, this script strips them safely.');
  process.exit(1);
}

console.log('✅ All environment variables are set');
console.log('🔍 Final DATABASE_URL before app start =', process.env.DATABASE_URL?.substring(0, 50) + '...');
console.log('🏃 Starting application...');

// -------------------- Start the Main Application --------------------
require('./src/app.js');
