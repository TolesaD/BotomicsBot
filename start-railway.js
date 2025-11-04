// Railway Startup - Wait for Variables
console.log('🚀 MarCreatorBot - Railway Startup');

// Wait a bit for Railway to inject environment variables
console.log('⏳ Waiting for Railway environment variables...');
await new Promise(resolve => setTimeout(resolve, 3000));

console.log('🔍 Environment Variables Status:');
console.log('   BOT_TOKEN:', process.env.BOT_TOKEN ? `SET (${process.env.BOT_TOKEN.length} chars)` : 'MISSING');
console.log('   ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? `SET (${process.env.ENCRYPTION_KEY.length} chars)` : 'MISSING');
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? `SET (${process.env.DATABASE_URL.length} chars)` : 'MISSING');

if (process.env.DATABASE_URL) {
  console.log('   DATABASE_URL starts with:', process.env.DATABASE_URL.substring(0, 25));
}

// Check if variables exist
if (!process.env.BOT_TOKEN || !process.env.ENCRYPTION_KEY || !process.env.DATABASE_URL) {
  console.error('❌ Missing required environment variables from Railway');
  console.error('💡 Check your Railway project variables:');
  console.error('   - BOT_TOKEN, ENCRYPTION_KEY must be manually set');
  console.error('   - DATABASE_URL should be auto-provided by PostgreSQL service');
  process.exit(1);
}

console.log('✅ All environment variables received from Railway');
console.log('🏃 Starting application...');

// Start the main application
require('./src/app.js');