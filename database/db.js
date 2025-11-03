const { Sequelize } = require('sequelize');
const config = require('../config/environment');

let sequelize;

console.log(`🗄️ Database configuration: ${config.DATABASE_DIALECT}`);
console.log(`🌐 Environment: ${config.NODE_ENV}`);

// CRITICAL FIX: Validate DATABASE_URL before using it
if (!config.DATABASE_URL) {
  console.error('❌ DATABASE_URL is required but not set');
  if (config.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without database connection in development');
    sequelize = new Sequelize('postgres://localhost:5432/temp');
  }
} else {
  console.log('🔄 Configuring PostgreSQL database...');
  
  // CRITICAL: Validate DATABASE_URL is a string and not null
  if (typeof config.DATABASE_URL !== 'string') {
    console.error('❌ DATABASE_URL must be a string, got:', typeof config.DATABASE_URL);
    console.error('🔍 DATABASE_URL value:', config.DATABASE_URL);
    if (config.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('⚠️  Continuing without database connection in development');
      sequelize = new Sequelize('postgres://localhost:5432/temp');
    }
  } else {
    // Safe logging (without exposing credentials)
    try {
      console.log(`📊 DATABASE_URL length: ${config.DATABASE_URL.length} chars`);
      console.log(`📊 DATABASE_URL starts with: ${config.DATABASE_URL.substring(0, 25)}`);
    } catch (error) {
      console.log('⚠️  Could not parse DATABASE_URL for logging');
    }
    
    // CRITICAL FIX: Use the DATABASE_URL directly without modification
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
  }
}

const connectDB = async () => {
  // If no DATABASE_URL, skip connection in development
  if (!config.DATABASE_URL && config.NODE_ENV !== 'production') {
    console.warn('⚠️  No DATABASE_URL set, skipping database connection');
    return false;
  }

  // CRITICAL: Additional validation
  if (config.DATABASE_URL && typeof config.DATABASE_URL !== 'string') {
    console.error('❌ DATABASE_URL is not a string:', typeof config.DATABASE_URL);
    if (config.NODE_ENV === 'production') {
      process.exit(1);
    }
    return false;
  }

  let retries = 5;
  
  while (retries > 0) {
    try {
      console.log('🔄 Connecting to PostgreSQL database...');
      await sequelize.authenticate();
      console.log('✅ PostgreSQL database connected successfully');
      
      // CRITICAL: Use alter in production to ensure schema matches models
      const syncOptions = config.NODE_ENV === 'production' 
        ? { alter: true, force: false }
        : { alter: true, force: false };
      
      console.log('🔄 Synchronizing database models...');
      await sequelize.sync(syncOptions);
      console.log('✅ Database models synchronized successfully');
      
      return true;
    } catch (error) {
      console.error(`❌ PostgreSQL connection failed (${retries} retries left):`, error.message);
      
      retries -= 1;
      if (retries === 0) {
        console.error('💥 All PostgreSQL connection attempts failed');
        
        if (config.NODE_ENV === 'production') {
          console.error('❌ Cannot continue without database in production');
          process.exit(1);
        } else {
          console.log('⚠️  Continuing without database connection in development...');
          return false;
        }
      }
      
      // Wait before retrying with exponential backoff
      const delay = Math.pow(2, 5 - retries) * 1000;
      console.log(`🔄 Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Health check method
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
      dialect: 'postgres',
      status: 'CONNECTED'
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      dialect: 'postgres',
      status: 'DISCONNECTED'
    };
  }
};

module.exports = { 
  sequelize, 
  connectDB, 
  healthCheck
};