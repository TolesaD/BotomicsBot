// setup-cpanel.js - cPanel Environment Setup
const fs = require('fs');
const path = require('path');

console.log('🔧 Yegara.com cPanel Setup Script');
console.log('==================================');

// Check if we're on cPanel
const isCpanel = process.env.HOME && process.env.HOME.includes('/home/');

if (!isCpanel) {
  console.log('⚠️  This script is designed for cPanel environments');
  console.log('💡 Running in simulation mode...');
}

// Create necessary directories
const directories = [
  'logs',
  'tmp',
  'data'
];

directories.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

if (!fs.existsSync('.env.example')) {
  fs.writeFileSync('.env.example', envExample);
  console.log('✅ Created .env.example file');
}

console.log('\n🎉 cPanel setup completed!');
console.log('Next steps:');
console.log('1. Set environment variables in cPanel');
console.log('2. Configure your database');
console.log('3. Deploy using Git Version Control');
console.log('4. Start your application with: npm start');