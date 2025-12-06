console.log('🔍 RAILWAY ENVIRONMENT CHECK');
console.log('============================');

// Show all Railway-specific variables
const railwayVars = Object.keys(process.env).filter(k => k.includes('RAILWAY'));
console.log('Railway variables:', railwayVars);

// Show our critical variables (masked)
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '***' + process.env.BOT_TOKEN.slice(-6) : 'NOT SET');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? 'SET' : 'NOT SET');
console.log('PORT:', process.env.PORT || 3000);

// If all variables are set, start the real app
if (process.env.BOT_TOKEN && process.env.DATABASE_URL && process.env.ENCRYPTION_KEY) {
  console.log('✅ All variables found! Starting main application...');
  console.log('🚀 Launching src/app.js...');
  
  // Start the real application
  require('./src/app.js');
} else {
  console.log('❌ Missing variables! Running debug server only...');
  
  // Debug server for Railway healthcheck
  const http = require('http');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'debug_mode',
      message: 'Running in debug mode - missing environment variables',
      variables: {
        BOT_TOKEN: !!process.env.BOT_TOKEN,
        DATABASE_URL: !!process.env.DATABASE_URL,
        ENCRYPTION_KEY: !!process.env.ENCRYPTION_KEY
      },
      help: 'Set variables in Railway Dashboard → Variables'
    }));
  });
  
  server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log(`🔧 Debug server running on port ${process.env.PORT || 3000}`);
  });
}