console.log('🔧 CRITICAL: Railway environment variables auto-quote handler active');

// ----------------- Helper: Clean env variables -----------------
function cleanEnv(value) {
  if (!value) return undefined;
  const trimmed = value.replace(/^["']|["']$/g, '').trim();
  if (trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null' || trimmed === '') {
    return undefined;
  }
  return trimmed;
}

// ----------------- Load and sanitize environment variables -----------------
const config = {
  BOT_TOKEN: cleanEnv(process.env.BOT_TOKEN),
  DATABASE_URL: cleanEnv(process.env.DATABASE_URL) || cleanEnv(process.env.RAILWAY_DATABASE_URL),
  ENCRYPTION_KEY: cleanEnv(process.env.ENCRYPTION_KEY),
  MAIN_BOT_NAME: cleanEnv(process.env.MAIN_BOT_NAME) || 'MarCreatorBot',
  MAIN_BOT_USERNAME: cleanEnv(process.env.MAIN_BOT_USERNAME) || '@MarCreatorBot',
  NODE_ENV: cleanEnv(process.env.NODE_ENV) || 'production',
  PORT: parseInt(cleanEnv(process.env.PORT)) || 3000,
  SUPPORT_USERNAME: cleanEnv(process.env.SUPPORT_USERNAME) || 'MarCreatorSupportBot',
  
  // Database pool settings
  DATABASE_POOL_MAX: parseInt(cleanEnv(process.env.DATABASE_POOL_MAX)) || 20,
  DATABASE_POOL_IDLE: parseInt(cleanEnv(process.env.DATABASE_POOL_IDLE)) || 30000,
  DATABASE_POOL_ACQUIRE: parseInt(cleanEnv(process.env.DATABASE_POOL_ACQUIRE)) || 60000,
};

// ----------------- Validation -----------------
if (!config.DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing or invalid. Check Railway variables.');
  process.exit(1);
}
if (!config.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing or invalid. Check Railway variables.');
  process.exit(1);
}
if (!config.ENCRYPTION_KEY) {
  console.error('❌ ENCRYPTION_KEY is missing or invalid. Check Railway variables.');
  process.exit(1);
}

// ----------------- Debug -----------------
console.log('✅ NODE_ENV:', config.NODE_ENV);
console.log('✅ PORT:', config.PORT);
console.log('🔧 BOT_TOKEN length:', config.BOT_TOKEN.length);
console.log('🔧 ENCRYPTION_KEY length:', config.ENCRYPTION_KEY.length);
console.log('🔧 DATABASE_URL length:', config.DATABASE_URL.length);

module.exports = config;
