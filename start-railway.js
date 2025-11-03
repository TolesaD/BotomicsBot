// Railway Startup Script - Wait for Environment Variables
console.log('🚀 MarCreatorBot - Railway Startup');
console.log('===================================');

// Function to wait for environment variables to be available
async function waitForEnvironmentVariables() {
  console.log('⏳ Waiting for Railway environment variables...');
  
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    // Check if required variables are available
    const hasBotToken = process.env.BOT_TOKEN && process.env.BOT_TOKEN.length > 10;
    const hasEncryptionKey = process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length > 10;
    const hasDatabaseUrl = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');
    
    if (hasBotToken && hasEncryptionKey && hasDatabaseUrl) {
      console.log('✅ Environment variables are now available');
      return true;
    }
    
    attempts++;
    console.log(`🔄 Attempt ${attempts}/${maxAttempts} - Waiting for variables...`);
    console.log(`   BOT_TOKEN: ${process.env.BOT_TOKEN ? 'SET (' + process.env.BOT_TOKEN.length + ' chars)' : 'MISSING'}`);
    console.log(`   ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? 'SET (' + process.env.ENCRYPTION_KEY.length + ' chars)' : 'MISSING'}`);
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'SET (' + process.env.DATABASE_URL.length + ' chars)' : 'MISSING'}`);
    
    if (process.env.DATABASE_URL) {
      console.log(`   DATABASE_URL starts with: ${process.env.DATABASE_URL.substring(0, 25)}`);
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.error('❌ Environment variables never became available');
  return false;
}

// Main startup function
async function startApplication() {
  // Wait for environment variables
  const envReady = await waitForEnvironmentVariables();
  
  if (!envReady) {
    console.error('💥 Cannot start without environment variables');
    process.exit(1);
  }
  
  console.log('✅ All environment variables are ready');
  console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   PORT: ${process.env.PORT || 8080}`);
  console.log(`   BOT_TOKEN: ${process.env.BOT_TOKEN ? 'SET (' + process.env.BOT_TOKEN.length + ' chars)' : 'MISSING'}`);
  console.log(`   ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? 'SET (' + process.env.ENCRYPTION_KEY.length + ' chars)' : 'MISSING'}`);
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'SET (' + process.env.DATABASE_URL.length + ' chars)' : 'MISSING'}`);
  
  if (process.env.DATABASE_URL) {
    console.log(`   DATABASE_URL verified: ${process.env.DATABASE_URL.includes('postgres') ? '✅ PostgreSQL' : '❌ Not PostgreSQL'}`);
  }
  
  // Check required variables one more time
  if (!process.env.BOT_TOKEN || !process.env.ENCRYPTION_KEY || !process.env.DATABASE_URL) {
    console.error('❌ Required environment variables are missing after waiting');
    process.exit(1);
  }
  
  console.log('🏃 Starting application from src/app.js...');
  
  // Start the main application
  require('./src/app.js');
}

// Start the application
startApplication().catch(error => {
  console.error('💥 Failed to start application:', error);
  process.exit(1);
});