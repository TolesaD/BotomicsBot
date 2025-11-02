const { Sequelize } = require('sequelize');
const config = require('../config/environment');
const fs = require('fs');
const path = require('path');

let sequelize;

console.log(`🗄️ Database configuration: ${config.DATABASE_DIALECT}`);

// Check if we have DATABASE_URL for PostgreSQL
if (config.DATABASE_URL) {
  console.log('🔄 Configuring PostgreSQL database...');
  console.log('✅ DATABASE_URL found - using PostgreSQL (data will persist)');
  
  sequelize = new Sequelize(config.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      ssl: config.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    logging: config.LOG_LEVEL === 'debug' ? console.log : false,
    pool: {
      max: config.DATABASE_POOL_MAX || 20,
      min: 0,
      acquire: config.DATABASE_POOL_ACQUIRE || 30000,
      idle: config.DATABASE_POOL_IDLE || 10000
    },
    retry: {
      max: 3
    }
  });
} else {
  // SQLite fallback with WARNING
  console.log('❌ DATABASE_URL not set - falling back to SQLite');
  console.log('🚨 WARNING: SQLite data will NOT persist across Railway deployments!');
  console.log('💡 Solution: Add PostgreSQL database in Railway Dashboard');
  console.log('   Railway → New → Database → PostgreSQL');
  
  let dbPath = './metabot_creator.db';
  if (dbPath.startsWith('./')) {
    dbPath = path.join(process.cwd(), dbPath);
  }
  
  // Ensure the directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  console.log(`📁 SQLite database path: ${dbPath}`);
  
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: config.LOG_LEVEL === 'debug' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
}

const connectDB = async () => {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    
    if (config.DATABASE_URL) {
      console.log('✅ PostgreSQL database connected successfully');
      console.log('✅ Your mini-bots will persist across deployments');
    } else {
      console.log('✅ SQLite database connected');
      console.log('🚨 WARNING: Mini-bots will be LOST on next deployment!');
    }
    
    // Sync all models
    const syncOptions = { alter: true, force: false };
    await sequelize.sync(syncOptions);
    console.log('✅ Database synchronized');
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    
    if (config.DATABASE_URL) {
      console.error('💡 PostgreSQL connection failed:');
      console.error('   - Check DATABASE_URL format');
      console.error('   - Verify database is accessible');
    } else {
      console.error('💡 SQLite connection failed');
    }
    
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };