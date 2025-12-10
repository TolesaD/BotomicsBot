const http = require('http');

const testUrl = 'http://localhost:3000/wallet';

const req = http.get(testUrl, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:');
  console.log('  ngrok-skip-browser-warning:', res.headers['ngrok-skip-browser-warning']);
  console.log('  x-ngrok-skip-browser-warning:', res.headers['x-ngrok-skip-browser-warning']);
  
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Response length:', data.length);
    console.log('Has meta tag:', data.includes('ngrok-skip-browser-warning'));
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
});