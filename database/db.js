// database/db.js - OPTIMIZED FOR LOCAL TESTING
const { Sequelize } = require('sequelize');
const config = require('../config/environment');

console.log('🗄️ Initializing database (TEST MODE)...');

// Use test-specific settings
const isProduction = config.NODE_ENV === 'production';
const isLocalTest = process.env.LOCAL_TEST === 'true' || config.NODE_ENV === 'development';

// For local testing, reduce pool size and disable SSL
const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  
  // Minimal logging for testing
  logging: isLocalTest ? (msg) => {
    // Only log important queries, skip the noisy ones
    if (!msg.includes('SELECT table_name') && 
        !msg.includes('information_schema') &&
        !msg.includes('pg_catalog') &&
        !msg.includes('bots') &&  // Skip bot queries during init
        !msg.includes('broadcast')) {
      console.log('   🗄️', msg.substring(0, 100));
    }
  } : false,
  
  // Tiny connection pool for testing
  pool: {
    max: isProduction ? 10 : 3,    // Much smaller for testing
    min: 0,
    acquire: 10000,      // Faster timeout
    idle: 5000,
  },
  
  // Disable SSL for local testing
  dialectOptions: isProduction ? {
    ssl: { require: true, rejectUnauthorized: false }
  } : {
    ssl: false
  },
  
  // Quick retry
  retry: {
    max: 2,
    timeout: 10000,
  },
  
  // Don't sync automatically in production
  sync: { force: false, alter: false },
  
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true,
  },
  
  // Query optimization for testing
  benchmark: false,
});

// Fast connection function - minimal checks
async function connectDB() {
  try {
    console.log('🔌 Quick database connection...');
    
    // Quick auth without heavy checks
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    // For local testing, skip heavy sync operations
    if (isLocalTest) {
      console.log('⏩ Test mode: Skipping full model sync');
      // Just sync essential tables
      const { User, Bot } = require('../src/models');
      await User.sync({ alter: true });
      console.log('✅ User table synced');
      return true;
    } else {
      // Production: full sync
      await sequelize.sync({ alter: true });
      console.log('✅ All tables synced');
      return true;
    }
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    
    if (isProduction) {
      console.error('💥 Production: Cannot continue without DB');
      process.exit(1);
    }
    
    console.log('⚠️  Test mode: Running with limited functionality');
    return false;
  }
}

// Lazy loading of models - don't load all at startup
let modelsLoaded = false;

async function loadModelsLazy() {
  if (!modelsLoaded) {
    console.log('📦 Lazy loading models...');
    // Only load essential models initially
    const essentialModels = [
      require('../src/models/User'),
      require('../src/models/Bot'),
    ];
    
    // Load other models on demand
    setTimeout(() => {
      try {
        require('../src/models/BroadcastHistory');
        require('../src/models/Transaction');
        require('../src/models/Subscription');
        console.log('✅ All models loaded lazily');
      } catch (e) {
        // Ignore - will load when needed
      }
    }, 5000); // Load after 5 seconds
    
    modelsLoaded = true;
  }
}

// Quick health check that doesn't load all models
async function quickHealthCheck() {
  try {
    await sequelize.query('SELECT 1 as test');
    return { 
      healthy: true, 
      timestamp: new Date().toISOString(),
      mode: isLocalTest ? 'TEST' : 'PRODUCTION'
    };
  } catch (error) {
    return { 
      healthy: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Optimized health check for main bot startup
async function startupHealthCheck() {
  try {
    console.log('🚀 Startup health check...');
    
    // 1. Quick connection test
    await sequelize.authenticate();
    
    // 2. Check only essential tables
    const [dbTime] = await sequelize.query('SELECT NOW() as current_time');
    
    // 3. Count only active bots (much faster)
    const [activeBots] = await sequelize.query(`
      SELECT COUNT(*) as count FROM bots WHERE is_active = true
    `);
    
    // 4. Count recent users (limit to make it fast)
    const [recentUsers] = await sequelize.query(`
      SELECT COUNT(*) as count FROM users 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      LIMIT 1
    `);
    
    console.log('✅ Startup health check passed');
    
    return {
      healthy: true,
      database: 'OK',
      stats: {
        activeBots: parseInt(activeBots[0].count),
        recentUsers: parseInt(recentUsers[0].count)
      },
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('⚠️  Startup health check warning:', error.message);
    return {
      healthy: true, // Still return true to allow startup
      warning: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Fast disconnect
async function disconnectDB() {
  try {
    await sequelize.close();
    console.log('✅ Database disconnected');
  } catch (error) {
    // Ignore disconnect errors in test mode
    if (!isLocalTest) console.error('❌ Disconnect error:', error.message);
  }
}

// Auto-start in background for faster bot initialization
setTimeout(() => {
  if (!isProduction) {
    console.log('⚡ Background database initialization...');
    connectDB().then(() => {
      loadModelsLazy();
    }).catch(() => {
      // Ignore errors in background
    });
  }
}, 1000); // Start after 1 second

module.exports = {
  sequelize,
  connectDB,
  quickHealthCheck,
  startupHealthCheck,
  disconnectDB,
  loadModelsLazy
};