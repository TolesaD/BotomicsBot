// scripts/pre-start.js
const fs = require('fs');
const path = require('path');

// Get environment from command line
const env = process.argv[2] || 'development';
console.log(`⚙️ Setting environment to: ${env}`);

// Set in process.env
process.env.NODE_ENV = env;

// Also update .env file if exists
const envFilePath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFilePath)) {
  let content = fs.readFileSync(envFilePath, 'utf8');
  
  // Update or add NODE_ENV
  if (content.includes('NODE_ENV=')) {
    content = content.replace(/NODE_ENV=.*/g, `NODE_ENV=${env}`);
  } else {
    content += `\nNODE_ENV=${env}\n`;
  }
  
  fs.writeFileSync(envFilePath, content);
}

console.log(`✅ Environment set successfully: ${env}`);