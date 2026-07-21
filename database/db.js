// database/db.js - NEON POSTGRESQL + RENDER
const { Sequelize } = require('sequelize');
const createConfig = require('../config/environment');
const config = createConfig();

console.log('🗄️ Database configuration:');
console.log('   Environment:', config.NODE_ENV);
console.log('   Platform:', config.IS_RENDER ? 'Render 🚀' : config.IS_RAILWAY ? 'Railway 🚂' : 'Local');

// Enhanced database URL parsing
let dbHost = 'unknown';
let dbName = 'unknown';
try {
  const dbUrl = new URL(config.DATABASE_URL);
  dbHost = `${dbUrl.hostname}:${dbUrl.port || 5432}`;
  dbName = dbUrl.pathname.replace('/', '') || 'unknown';
} catch (error) {
  // If URL parsing fails, try to extract host info manually
  const match = config.DATABASE_URL?.match(/@([^:]+):(\d+)\/([^?]+)/);
  if (match) {
    dbHost = `${match[1]}:${match[2]}`;
    dbName = match[3];
  }
}

console.log('   Database Host:', dbHost);
console.log('   Database Name:', dbName);
console.log('   Connection URL Length:', config.DATABASE_URL?.length || 0);

// Create Sequelize instance with Neon + Render optimizations
const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  logging: config.NODE_ENV === 'development' ? (msg) => {
    // Filter out noisy logs in development
    if (!msg.includes('SELECT table_name') && 
        !msg.includes('information_schema') &&
        !msg.includes('pg_catalog')) {
      console.log('   🗄️', msg);
    }
  } : false,
  
  pool: {
    max: config.DATABASE_POOL_MAX || 10,
    min: 0,
    acquire: config.DATABASE_POOL_ACQUIRE || 60000,
    idle: config.DATABASE_POOL_IDLE || 10000,
    evict: 1000
  },
  
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false // Required for Neon
    },
    connectTimeout: 60000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
  },
  
  retry: {
    max: 5,
    timeout: 60000,
    match: [
      /ConnectionError/,
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
      /TimeoutError/,
      /ECONNRESET/,
      /ETIMEDOUT/
    ],
    backoffBase: 1000,
    backoffExponent: 1.5
  },
  
  // Connection timeout
  connectTimeout: 60000,
});

console.log('✅ Database configured successfully (Neon PostgreSQL)');

// Enhanced database connection function
async function connectDB() {
  try {
    console.log('🗄️ Establishing database connection to Neon PostgreSQL...');
    
    // Test connection with timeout
    const connectionPromise = sequelize.authenticate();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout after 60s')), 60000);
    });
    
    await Promise.race([connectionPromise, timeoutPromise]);
    console.log('✅ Neon database connection established successfully!');
    
    // Sync models based on environment
    if (config.NODE_ENV === 'development') {
      console.log('🔄 Development mode: Synchronizing database models...');
      await sequelize.sync({ 
        alter: true,
        force: false,
        logging: console.log
      });
      console.log('✅ All database models synchronized');
    } else {
      // In production, sync with caution (alter: true for schema updates)
      console.log('🚨 PRODUCTION MODE: Syncing database models (alter: true)...');
      try {
        await sequelize.sync({ 
          alter: true,
          force: false
        });
        console.log('✅ Database models synchronized successfully');
      } catch (syncError) {
        console.error('⚠️  Sync error (non-critical for existing tables):', syncError.message);
        // Continue anyway - tables might already exist
      }
      
      // Verify tables exist without modifying them
      try {
        const [results] = await sequelize.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
          AND table_name IN ('users', 'wallets', 'bots')
          LIMIT 3
        `);
        
        const foundTables = results.map(r => r.table_name);
        console.log(`✅ Found ${foundTables.length} core tables: ${foundTables.join(', ')}`);
        
        if (foundTables.length === 0) {
          console.warn('⚠️  No tables found! Creating tables...');
          // Force sync to create tables
          await sequelize.sync({ force: false, alter: true });
          console.log('✅ Tables created successfully');
        }
      } catch (checkError) {
        console.log('⚠️  Table check failed, attempting to create tables...');
        try {
          await sequelize.sync({ force: false, alter: true });
          console.log('✅ Tables created successfully');
        } catch (createError) {
          console.error('❌ Failed to create tables:', createError.message);
        }
      }
    }
    
    // Test basic operations
    try {
      const [results] = await sequelize.query('SELECT NOW() as current_time');
      console.log('✅ Database time check:', results[0].current_time);
    } catch (testError) {
      console.log('⚠️  Database time check failed (non-critical):', testError.message);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('   Error:', error.message);
    
    if (error.message.includes('timeout')) {
      console.error('💡 Connection timeout - check your database host and credentials');
    } else if (error.message.includes('authentication')) {
      console.error('💡 Authentication failed - check database username and password');
    } else if (error.message.includes('getaddrinfo')) {
      console.error('💡 Host not found - check database hostname in DATABASE_URL');
    } else if (error.message.includes('SSL')) {
      console.error('💡 SSL connection issue - check SSL configuration');
    } else if (error.message.includes('database')) {
      console.error('💡 Database not found - verify database name exists');
    } else if (error.message.includes('foreign key constraint')) {
      console.error('💡 Foreign key constraint violation - check existing data integrity');
      console.error('💡 Run this SQL to find invalid references:');
      console.error(`
        SELECT w.user_id 
        FROM wallets w 
        LEFT JOIN users u ON w.user_id = u.telegram_id 
        WHERE u.telegram_id IS NULL;
      `);
    }
    
    // Retry logic for production
    if (config.NODE_ENV === 'production') {
      console.log('⏳ Retrying connection in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connectDB(); // Retry
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
        host: sequelize.config.host,
        platform: 'Neon PostgreSQL'
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
        error: error.message,
        platform: 'Neon PostgreSQL'
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
      database: 'Neon PostgreSQL - OK'
    };
  } catch (error) {
    return { 
      healthy: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Disconnect function with better cleanup
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
console.log('🚀 Database will connect when app starts');
console.log('📊 Neon PostgreSQL pool configured');

module.exports = {
  sequelize,
  connectDB,
  healthCheck,
  quickHealthCheck,
  disconnectDB
};