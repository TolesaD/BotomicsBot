const { Sequelize } = require('sequelize');
const config = require('../config/environment');

let sequelize;

console.log(`🗄️ Database configuration: ${config.DATABASE_DIALECT}`);
console.log(`🌐 Environment: ${config.NODE_ENV}`);

// Validate DATABASE_URL
if (!config.DATABASE_URL) {
  console.error('❌ DATABASE_URL is required but not set');
  console.error('💡 Make sure PostgreSQL addon is provisioned in Railway');
  process.exit(1);
}

console.log('🔄 Configuring PostgreSQL database for Railway...');

// Parse DATABASE_URL to extract info for logging (without exposing credentials)
try {
  const dbUrl = new URL(config.DATABASE_URL);
  console.log(`📊 PostgreSQL Host: ${dbUrl.hostname}`);
  console.log(`📊 PostgreSQL Database: ${dbUrl.pathname.substring(1)}`);
} catch (error) {
  console.log('⚠️  Could not parse DATABASE_URL for logging');
}

sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: {
    ssl: config.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false,
    connectTimeout: 60000,
    keepAlive: true,
    statement_timeout: 60000,
    query_timeout: 60000,
  },
  logging: config.LOG_LEVEL === 'debug' ? console.log : false,
  pool: {
    max: config.DATABASE_POOL_MAX || 20,
    min: 0,
    acquire: config.DATABASE_POOL_ACQUIRE || 60000,
    idle: config.DATABASE_POOL_IDLE || 10000,
    evict: 10000,
    handleDisconnects: true,
  },
  retry: {
    max: 5,
    timeout: 30000,
    match: [
      /ConnectionError/,
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
      /TimeoutError/,
      /SequelizeDatabaseError/,
    ],
  },
  connectTimeout: 60000,
});

const connectDB = async () => {
  let retries = 5;
  
  while (retries > 0) {
    try {
      console.log('🔄 Connecting to PostgreSQL database...');
      await sequelize.authenticate();
      console.log('✅ PostgreSQL database connected successfully');
      
      // Sync all models
      console.log('🔄 Synchronizing database models...');
      await sequelize.sync({ alter: true, force: false });
      console.log('✅ Database models synchronized successfully');
      
      // Verify we can query the database
      try {
        const { Bot } = require('../models');
        const botCount = await Bot.count();
        console.log(`📊 Database verified: ${botCount} bots found`);
        
        if (botCount > 0) {
          const activeBots = await Bot.findAll({ where: { is_active: true } });
          console.log(`📊 Active bots ready for initialization: ${activeBots.length}`);
        }
      } catch (queryError) {
        console.log('⚠️  Could not query bots table (might be first run):', queryError.message);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ PostgreSQL connection failed (${retries} retries left):`, error.message);
      
      retries -= 1;
      if (retries === 0) {
        console.error('💥 All PostgreSQL connection attempts failed');
        console.error('💡 Railway PostgreSQL troubleshooting:');
        console.error('   - Check if PostgreSQL addon is provisioned');
        console.error('   - Verify the addon is running (not paused)');
        console.error('   - Check Railway project logs for PostgreSQL service');
        console.error('   - Ensure DATABASE_URL is correctly set by Railway');
        
        if (config.NODE_ENV === 'production') {
          console.error('❌ Cannot continue without database in production');
          process.exit(1);
        }
      }
      
      // Wait before retrying
      const delay = Math.pow(2, 5 - retries) * 1000;
      console.log(`🔄 Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
};

// Add health check method
const healthCheck = async () => {
  try {
    await sequelize.authenticate();
    const { Bot } = require('../models');
    const botCount = await Bot.count();
    const activeBots = await Bot.count({ where: { is_active: true } });
    
    return {
      healthy: true,
      bots: {
        total: botCount,
        active: activeBots
      },
      dialect: 'postgres'
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      dialect: 'postgres'
    };
  }
};

module.exports = { sequelize, connectDB, healthCheck };