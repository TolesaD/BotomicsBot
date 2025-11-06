console.log('🔧 CRITICAL: Production-ready Railway env handler active');

function cleanEnv(value) {
  if (!value) return undefined;
  const trimmed = value.replace(/^["']|["']$/g, '').trim();
  if (trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null' || trimmed === '') return undefined;
  return trimmed;
}

// ----------------- Load env -----------------
let databaseUrl = cleanEnv(process.env.DATABASE_URL);

// Production fallback: if Railway quotes break DATABASE_URL, use RAILWAY_DATABASE_URL directly
if (process.env.NODE_ENV === 'production' && !databaseUrl && process.env.RAILWAY_DATABASE_URL) {
  databaseUrl = cleanEnv(process.env.RAILWAY_DATABASE_URL);
}

const config = {
  NODE_ENV: cleanEnv(process.env.NODE_ENV) || 'production',
  PORT: parseInt(cleanEnv(process.env.PORT)) || 3000,
  BOT_TOKEN: cleanEnv(process.env.BOT_TOKEN),
  ENCRYPTION_KEY: cleanEnv(process.env.ENCRYPTION_KEY),
  DATABASE_URL: databaseUrl,
  MAIN_BOT_NAME: cleanEnv(process.env.MAIN_BOT_NAME) || 'MarCreatorBot',
  MAIN_BOT_USERNAME: cleanEnv(process.env.MAIN_BOT_USERNAME) || '@MarCreatorBot',
  SUPPORT_USERNAME: cleanEnv(process.env.SUPPORT_USERNAME) || 'MarCreatorSupportBot',
};

// ----------------- Validate critical vars -----------------
const missing = [];
if (!config.DATABASE_URL) missing.push('DATABASE_URL');
if (!config.BOT_TOKEN) missing.push('BOT_TOKEN');
if (!config.ENCRYPTION_KEY) missing.push('ENCRYPTION_KEY');

if (missing.length > 0) {
  console.error(`❌ Missing or invalid environment variables: ${missing.join(', ')}`);
  console.error('💡 For production, ensure Railway variables are correctly linked and contain no quotes.');
  process.exit(1);
}

// ----------------- Debug -----------------
console.log('✅ NODE_ENV:', config.NODE_ENV);
console.log('✅ PORT:', config.PORT);
console.log('🔧 DATABASE_URL:', config.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('🔧 BOT_TOKEN length:', config.BOT_TOKEN ? config.BOT_TOKEN.length : 'MISSING');
console.log('🔧 ENCRYPTION_KEY length:', config.ENCRYPTION_KEY ? config.ENCRYPTION_KEY.length : 'MISSING');

module.exports = config;
