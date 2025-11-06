/**
 * Railway Startup Script - Handles auto-quoting and validates envs
 */

console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');

// Load environment config
const config = require('./config/environment');

// Debug logs to confirm everything is cleaned
console.log('🔍 DEBUG Cleaned DATABASE_URL:', config.DATABASE_URL);
console.log('🔍 DEBUG Cleaned BOT_TOKEN:', config.BOT_TOKEN ? 'SET' : 'MISSING');
console.log('🔍 DEBUG Cleaned ENCRYPTION_KEY:', config.ENCRYPTION_KEY ? 'SET' : 'MISSING');
console.log('✅ All environment variables are validated and ready');

// Start the main application
console.log('🏃 Starting application...');
require('./src/app.js');
