// Railway Startup - Final Version
console.log('🚀 MarCreatorBot - Railway Startup');

// Wait for Railway to inject variables
console.log('⏳ Waiting for Railway environment variables...');
await new Promise(resolve => setTimeout(resolve, 3000));

console.log('🔍 Checking required environment variables:');
console.log('   BOT_TOKEN:', process.env.BOT_TOKEN ? `SET (${process.env.BOT_TOKEN.length} chars)` : 'MISSING');
console.log('   ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? `SET (${process.env.ENCRYPTION_KEY.length} chars)` : 'MISSING');
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? `SET (${process.env.DATABASE_URL.length} chars)` : 'MISSING');

if (process.env.DATABASE_URL) {
  console.log('   DATABASE_URL verified:', process.env.DATABASE_URL.includes('postgres') ? '✅ PostgreSQL' : '❌ Not PostgreSQL');
}

// Check if all required variables are present
if (!process.env.BOT_TOKEN || !process.env.ENCRYPTION_KEY || !process.env.DATABASE_URL) {
  console.error('❌ Missing required environment variables in Railway');
  console.error('💡 Please add these variables in Railway dashboard:');
  console.error('   - BOT_TOKEN: Your Telegram bot token');
  console.error('   - ENCRYPTION_KEY: 32-character encryption key');
  console.error('   - DATABASE_URL: Should be auto-provided by PostgreSQL service');
  
  // Start a simple server so deployment doesn't fail
  const http = require('http');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🚀 MarCreatorBot - Waiting for Environment Variables\n\n' +
      'Please add these variables in Railway:\n' +
      '- BOT_TOKEN\n- ENCRYPTION_KEY\n- DATABASE_URL\n\n' +
      'Then redeploy to start the bot.'
    );
  });
  
  const PORT = process.env.PORT || 8080;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server running on port ${PORT} - Waiting for variables`);
  });
  
  // Keep the process alive
  setInterval(() => {}, 1000);
} else {
  console.log('✅ All environment variables are set');
  console.log('🏃 Starting MarCreatorBot application...');
  
  // Start the main application
  require('./src/app.js');
}