// debug-start.js - UPDATED VERSION
console.log('🚀 Railway Deployment Launcher');
console.log('==============================');

// Show environment
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Port: ${process.env.PORT || 3000}`);
console.log(`Host: ${process.env.HOST || '0.0.0.0'}`);

// Check critical variables
const required = ['BOT_TOKEN', 'DATABASE_URL', 'ENCRYPTION_KEY'];
const missing = required.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.error('❌ Missing critical variables:', missing);
  console.error('💡 Add these in Railway Dashboard → Variables');
  
  // Debug server
  const http = require('http');
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'debug',
      message: 'Missing variables',
      missing: missing
    }));
  }).listen(process.env.PORT || 3000, '0.0.0.0');
} else {
  console.log('✅ All critical variables found!');
  console.log('🚀 Launching main application...');
  
  // Start the real app
  require('./src/app.js');
}