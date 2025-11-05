const { Sequelize } = require('sequelize');
const config = require('../config/environment'); // Import from config

// Enhanced database connection with better error handling
let sequelize;

try {
  console.log('🗄️ Database configuration:');
  console.log('   DATABASE_URL exists:', !!config.DATABASE_URL);
  
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in configuration');
  }

  console.log('   DATABASE_URL length:', config.DATABASE_URL.length);
  
  // Parse DATABASE_URL for logging (safely)
  let dbLogInfo = 'Could not parse DATABASE_URL';
  try {
    const dbUrl = new URL(config.DATABASE_URL);
    dbLogInfo = `${dbUrl.hostname}:${dbUrl.port}${dbUrl.pathname}`;
  } catch (e) {
    // If URL parsing fails, use a substring for logging
    dbLogInfo = config.DATABASE_URL.substring(0, 50) + '...';
  }
  
  console.log('   Connecting to:', dbLogInfo);

  // Create Sequelize instance with connection pooling
  sequelize = new Sequelize(config.DATABASE_URL, {
    dialect: 'postgres',
    logging: config.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: config.DATABASE_POOL_MAX || 5,
      min: 0,
      acquire: config.DATABASE_POOL_ACQUIRE || 60000,
      idle: config.DATABASE_POOL_IDLE || 10000,
    },
    dialectOptions: {
      ssl: config.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });

  console.log('✅ Database configured successfully');

} catch (error) {
  console.error('❌ Database configuration failed:');
  console.error('   Error:', error.message);
  console.error('   DATABASE_URL available:', !!config.DATABASE_URL);
  if (config.DATABASE_URL) {
    console.error('   DATABASE_URL value:', config.DATABASE_URL.substring(0, 20) + '...');
  }
  process.exit(1);
}

module.exports = { sequelize };