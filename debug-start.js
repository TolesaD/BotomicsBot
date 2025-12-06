console.log('🚀 DEBUGGING VARIABLES');
console.log('BOT_TOKEN exists:', !!process.env.BOT_TOKEN);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('ENCRYPTION_KEY exists:', !!process.env.ENCRYPTION_KEY);
console.log('RAILWAY_STATIC_URL:', process.env.RAILWAY_STATIC_URL || 'NOT SET (Railway will set this)');

// Start server
const http = require('http');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    env_vars: {
      bot_token: !!process.env.BOT_TOKEN,
      database_url: !!process.env.DATABASE_URL,
      encryption_key: !!process.env.ENCRYPTION_KEY,
      railway_url: process.env.RAILWAY_STATIC_URL || null
    }
  }));
}).listen(PORT, HOST, () => {
  console.log(`✅ Server: ${HOST}:${PORT}`);
});