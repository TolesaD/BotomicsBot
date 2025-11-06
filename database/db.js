/**
 * Database Initialization for MarCreatorBot
 * Safe + Railway-Compatible PostgreSQL Connection
 */

const { Sequelize } = require('sequelize');
const config = require('../config/environment');

// -------------------- Utility: Mask Database URL --------------------
function maskDatabaseURL(url) {
  if (!url) return 'NOT SET';
  try {
    const masked = url.replace(/\/\/(.*?):(.*?)@/, '//****:****@');
    return masked;
  } catch {
    return 'INVALID URL FORMAT';
  }
}

// -------------------- Ensure DATABASE_URL Exists --------------------
if (!config.DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing.');
  console.error('💡 Hint: On Railway, add it in Variables as DATABASE_URL or use RAILWAY_DATABASE_URL');
  process.exit(1);
}

console.log('🔧 Connecting to PostgreSQL...');
console.log('   Host:', maskDatabaseURL(config.DATABASE_URL));
console.log('   Pool: max', config.DATABASE_POOL_MAX, '| idle', config.DATABASE_POOL_IDLE);
console.log('   Environment:', config.NODE_ENV);

// -------------------- Initialize Sequelize --------------------
const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: config.LOG_LEVEL === 'debug' ? console.log : false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // ✅ Required for Railway
    },
  },
  pool: {
    max: config.DATABASE_POOL_MAX,
    min: 0,
    acquire: config.DATABASE_POOL_ACQUIRE,
    idle: config.DATABASE_POOL_IDLE,
  },
});

// -------------------- Test Connection with Retry --------------------
async function testConnection(retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection established successfully');
      return true;
    } catch (error) {
      console.error(`⚠️  Database connection failed (attempt ${i + 1}/${retries}):`, error.message);
      if (i < retries - 1) {
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        console.error('❌ Unable to connect to the database after multiple attempts.');
        process.exit(1);
      }
    }
  }
}

// -------------------- Auto Initialize --------------------
(async () => {
  await testConnection();
})();

module.exports = sequelize;
