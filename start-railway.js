// Railway Test - Check ALL Environment Variables
console.log('🚀 Railway Environment Variables Test');

// List ALL environment variables
console.log('🔍 ALL Environment Variables:');
Object.keys(process.env).forEach(key => {
  console.log(`   ${key}:`, process.env[key] ? `"${process.env[key]}"` : 'NOT SET');
});

// Check if we have ANY variables at all
const allVars = Object.keys(process.env);
console.log(`📊 Total environment variables: ${allVars.length}`);

if (allVars.length === 0) {
  console.error('❌ NO environment variables found!');
  console.error('💡 This means Railway is not injecting any variables');
  console.error('💡 Check your Railway project configuration');
} else {
  console.log('✅ Environment variables found, but required ones are missing');
  console.log('💡 Check if BOT_TOKEN, ENCRYPTION_KEY, DATABASE_URL are set in Railway');
}

// Start a simple HTTP server to verify deployment works
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Railway Test - Environment Variables: ${allVars.length} found\n\n` +
    allVars.map(key => `${key}: ${process.env[key] ? 'SET' : 'NOT SET'}`).join('\n')
  );
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Test server running on port ${PORT}`);
  console.log('📱 Visit your Railway app URL to see environment status');
});