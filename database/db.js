/**
 * Production-Proof Database Connection for Railway
 * Handles Railway auto-quoting, SSL, and connection pooling
 */

const { Sequelize } = require('sequelize');
const config = require('../config/environment');

console.log('🗄️ Database configuration:');

// Ensure DATABASE_URL is valid
if (!config.DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing or invalid. Cannot connect to PostgreSQL.');
  process.exit(1);
}

console.log('   Using DATABASE_URL from config');

// ------------------- Sequelize Instance -------------------
const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  logging: config.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: config.DATABASE_POOL_MAX || 20,
    min: 0,
    acquire: config.DATABASE_POOL_ACQUIRE || 60000,
    idle: config.DATABASE_POOL_IDLE || 30000,
  },
  dialectOptions: {
    ssl: config.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false, // Railway PostgreSQL requires this
    } : false,
  },
});

console.log('✅ Sequelize instance created successfully');

// ------------------- Database Connection -------------------
async function connectDB() {
  try {
    console.log('🗄️ Establishing database connection...');
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');

    // Sync all models (without importing them to avoid circular dependencies)
    await sequelize.sync({ alter: true });
    console.log('✅ All database models synchronized');

    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// ------------------- Health Check -------------------
async function healthCheck() {
  try {
    await sequelize.authenticate();

    // Import models dynamically to avoid circular dependency
    const { Bot } = require('../src/models');

    const totalBots = await Bot.count();
    const activeBots = await Bot.count({ where: { is_active: true } });

    return {
      healthy: true,
      bots: {
        total: totalBots,
        active: activeBots,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ Database health check failed:', error.message);
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

// ------------------- Disconnect -------------------
async function disconnectDB() {
  try {
    await sequelize.close();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
  }
}

module.exports = {
  sequelize,
  connectDB,
  healthCheck,
  disconnectDB,
};
