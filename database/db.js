// database/db.js - RAILWAY POSTGRESQL VERSION
const { Sequelize } = require('sequelize');
const config = require('../config/environment');

console.log('🗄️ Database configuration:');
console.log('   Environment:', config.NODE_ENV);
console.log('   Platform:', config.IS_RAILWAY ? 'Railway PostgreSQL 🚂' : 'Local');

if (!config.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not configured');
  console.error('💡 How to fix on Railway:');
  console.error('   1. Go to Railway Dashboard → Your Project');
  console.error('   2. Click "New" → Database → PostgreSQL');
  console.error('   3. Copy the DATABASE_URL provided by Railway');
  console.error('   4. Go to Variables tab and add DATABASE_URL');
  process.exit(1);
}

// Parse database URL for logging
let dbInfo = 'Railway PostgreSQL';
try {
  const dbUrl = new URL(config.DATABASE_URL);
  const host = dbUrl.hostname;
  const dbName = dbUrl.pathname.replace('/', '');
  dbInfo = `${host}/${dbName}`;
} catch (error) {
  // If URL parsing fails, use as-is
}

console.log('   Database:', dbInfo);

// Create Sequelize instance optimized for Railway PostgreSQL
const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  logging: config.IS_DEVELOPMENT ? (msg) => {
    // Filter out noisy logs
    if (!msg.includes('SELECT table_name') && 
        !msg.includes('information_schema') &&
        !msg.includes('pg_catalog')) {
      console.log('   🗄️', msg);
    }
  } : false,
  
  pool: {
    max: config.DATABASE_POOL_MAX,
    min: 0,
    acquire: config.DATABASE_POOL_ACQUIRE,
    idle: config.DATABASE_POOL_IDLE,
  },
  
  dialectOptions: {
    ssl: config.IS_PRODUCTION ? {
      require: true,
      rejectUnauthorized: false
    } : false,
    connectTimeout: 30000,
    keepAlive: true,
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
    ],
  },
  
  // Connection timeout
  connectTimeout: 30000,
});

console.log('✅ Database configured for Railway');

// Enhanced database connection function
async function connectDB() {
  try {
    console.log('🗄️ Establishing database connection to Railway PostgreSQL...');
    
    // Test connection with timeout
    const connectionPromise = sequelize.authenticate();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout after 30s')), 30000);
    });
    
    await Promise.race([connectionPromise, timeoutPromise]);
    console.log('✅ Database connection established successfully');
    
    // Sync all models with better error handling
    console.log('🔄 Synchronizing database models...');
    await sequelize.sync({ 
      alter: true,
      force: false,
      logging: config.IS_DEVELOPMENT ? console.log : false
    });
    console.log('✅ All database models synchronized');
    
    // Test basic operations
    try {
      const [results] = await sequelize.query('SELECT NOW() as current_time, version() as version');
      console.log('✅ Database time check:', results[0].current_time);
      console.log('✅ PostgreSQL Version:', results[0].version.split(' ')[1]);
    } catch (testError) {
      console.log('⚠️  Database time check failed (non-critical):', testError.message);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('   Error:', error.message);
    
    if (error.message.includes('timeout')) {
      console.error('💡 Connection timeout - check your Railway database service');
    } else if (error.message.includes('authentication')) {
      console.error('💡 Authentication failed - check DATABASE_URL credentials');
    } else if (error.message.includes('getaddrinfo')) {
      console.error('💡 Host not found - check DATABASE_URL hostname');
    } else if (error.message.includes('SSL')) {
      console.error('💡 SSL connection issue - Railway requires SSL');
    } else if (error.message.includes('database')) {
      console.error('💡 Database not found - verify database exists on Railway');
    }
    
    console.error('\n💡 Railway Database Setup:');
    console.error('   1. Go to Railway Dashboard → Your Project');
    console.error('   2. Add "PostgreSQL" database service');
    console.error('   3. Copy DATABASE_URL from service variables');
    console.error('   4. Add to your project variables');
    
    if (config.IS_PRODUCTION) {
      console.error('💥 Cannot continue without database connection');
      process.exit(1);
    }
    
    console.error('⚠️  Development mode: Continuing without database');
    return false;
  }
}

// Enhanced health check function
async function healthCheck() {
  try {
    // Test basic connection
    await sequelize.authenticate();
    
    // Import models dynamically to avoid circular dependency
    const { Bot, User, Feedback } = require('../src/models');
    
    // Check if we can query the database
    const [dbTime] = await sequelize.query('SELECT NOW() as current_time');
    const totalBots = await Bot.count();
    const activeBots = await Bot.count({ where: { is_active: true } });
    const totalUsers = await User.count();
    const pendingMessages = await Feedback.count({ where: { is_replied: false } });
    
    return {
      healthy: true,
      database: {
        time: dbTime[0].current_time,
        connection: 'OK',
        platform: 'Railway PostgreSQL',
        host: sequelize.config.host
      },
      stats: {
        totalBots: totalBots,
        activeBots: activeBots,
        totalUsers: totalUsers,
        pendingMessages: pendingMessages
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Database health check failed:', error.message);
    return {
      healthy: false,
      error: error.message,
      database: {
        connection: 'FAILED',
        error: error.message
      },
      timestamp: new Date().toISOString()
    };
  }
}

// Quick health check (lightweight version)
async function quickHealthCheck() {
  try {
    await sequelize.authenticate();
    return { 
      healthy: true, 
      timestamp: new Date().toISOString(),
      database: 'Railway PostgreSQL OK'
    };
  } catch (error) {
    return { 
      healthy: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Disconnect function
async function disconnectDB() {
  try {
    console.log('🛑 Closing database connection...');
    await sequelize.close();
    console.log('✅ Database connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing database connection:', error.message);
  }
}

// Test connection on startup
if (config.IS_DEVELOPMENT) {
  console.log('🔧 Development mode: Testing database connection...');
  connectDB().then(success => {
    if (success) {
      console.log('✅ Development database: READY');
    } else {
      console.log('⚠️  Development database: LIMITED FUNCTIONALITY');
    }
  }).catch(error => {
    console.log('⚠️  Development database test failed:', error.message);
  });
}

module.exports = {
  sequelize,
  connectDB,
  healthCheck,
  quickHealthCheck,
  disconnectDB
};