// src/services/scripts/create_product_catalog_tables.js
const path = require('path');

// Load environment variables from the .env file in project root
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

console.log('📁 Current script location:', __dirname);
console.log('🔍 Looking for database at:', path.resolve(__dirname, '../../../database/db.js'));
console.log('🔧 Loading .env from:', path.resolve(__dirname, '../../../.env'));
console.log('🌱 DATABASE_URL available:', !!process.env.DATABASE_URL);

// Try to load the database module
let sequelize;
try {
  const db = require(path.join(__dirname, '../../../database/db'));
  sequelize = db.sequelize;
  console.log('✅ Database module loaded successfully!');
} catch (error) {
  console.error('❌ Error loading database module:', error.message);
  console.error('Error stack:', error.stack);
  
  console.log('\n📋 Environment check:');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('DATABASE_URL length:', process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 'undefined');
  console.log('DATABASE_URL first 50 chars:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 50) + '...' : 'undefined');
  
  console.log('\n💡 Troubleshooting steps:');
  console.log('1. Check if .env file exists at project root');
  console.log('2. Verify DATABASE_URL is set in .env file');
  console.log('3. Check if database/db.js file exists');
  console.log('4. Run: node -e "console.log(process.env.DATABASE_URL)" to test');
  
  process.exit(1);
}

async function createProductCatalogTables() {
  console.log('🔄 Creating product catalog tables...');
  
  // Test database connection first
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established!');
  } catch (error) {
    console.error('❌ Cannot connect to database:', error.message);
    throw error;
  }
  
  const transaction = await sequelize.transaction();
  
  try {
    // First, check if 'bots' table exists (it's referenced in foreign keys)
    try {
      const [tables] = await sequelize.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'bots'
      `);
      
      if (tables.length === 0) {
        console.log('⚠️  "bots" table does not exist. Creating it first...');
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS bots (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            token VARCHAR(255) NOT NULL UNIQUE,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `, { transaction });
        console.log('✅ Created bots table');
      } else {
        console.log('✅ Found existing bots table');
      }
    } catch (error) {
      console.log('⚠️  Could not check for bots table, continuing anyway:', error.message);
    }
    
    // Create product_catalog table
    console.log('📦 Creating product_catalog table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS product_catalog (
        id SERIAL PRIMARY KEY,
        bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(10) DEFAULT 'BOM',
        stock_quantity INTEGER,
        is_digital BOOLEAN DEFAULT false,
        digital_content TEXT,
        image_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, { transaction });
    
    // Create indexes for product_catalog
    console.log('📊 Creating indexes for product_catalog...');
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_product_catalog_bot_active 
      ON product_catalog(bot_id, is_active);
      
      CREATE INDEX IF NOT EXISTS idx_product_catalog_price 
      ON product_catalog(price);
      
      CREATE INDEX IF NOT EXISTS idx_product_catalog_created 
      ON product_catalog(created_at);
    `, { transaction });
    
    // Create product_orders table
    console.log('🛒 Creating product_orders table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS product_orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES product_catalog(id) ON DELETE RESTRICT,
        customer_user_id BIGINT NOT NULL,
        quantity INTEGER DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'BOM',
        status VARCHAR(20) DEFAULT 'pending' 
          CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
        payment_method VARCHAR(20) DEFAULT 'bom',
        payment_transaction_id INTEGER,
        delivery_details JSON,
        digital_content_delivered BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, { transaction });
    
    // Create indexes for product_orders
    console.log('📊 Creating indexes for product_orders...');
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_product_orders_order_number 
      ON product_orders(order_number);
      
      CREATE INDEX IF NOT EXISTS idx_product_orders_bot 
      ON product_orders(bot_id);
      
      CREATE INDEX IF NOT EXISTS idx_product_orders_customer 
      ON product_orders(customer_user_id);
      
      CREATE INDEX IF NOT EXISTS idx_product_orders_status 
      ON product_orders(status);
      
      CREATE INDEX IF NOT EXISTS idx_product_orders_created 
      ON product_orders(created_at);
    `, { transaction });
    
    await transaction.commit();
    console.log('✅ Product catalog tables created successfully!');
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error creating product catalog tables:', error.message);
    console.error('Full error:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createProductCatalogTables()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = createProductCatalogTables;