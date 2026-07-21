const { sequelize } = require('../../database/db');
const { QueryTypes } = require('sequelize');

async function createSubscriptionTables() {
  try {
    console.log('🔄 Creating subscription-related tables for PostgreSQL...');
    
    // Check if user_subscriptions table exists (PostgreSQL syntax)
    const tableCheck = await sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_subscriptions'",
      { type: QueryTypes.SELECT }
    );
    
    if (tableCheck.length === 0) {
      await sequelize.query(`
        CREATE TABLE user_subscriptions (
          id SERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL,
          tier VARCHAR(20) NOT NULL CHECK (tier IN ('freemium', 'premium')),
          status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
          monthly_price DECIMAL(10,2) DEFAULT 5.00,
          currency VARCHAR(10) DEFAULT 'BOM',
          current_period_start TIMESTAMP NOT NULL,
          current_period_end TIMESTAMP NOT NULL,
          auto_renew BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await sequelize.query(`
        CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
        CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
      `);
      
      console.log('✅ Created user_subscriptions table');
    } else {
      console.log('✅ user_subscriptions table already exists');
    }
    
    // Add premium fields to users table if they don't exist (PostgreSQL syntax)
    const userColumns = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'premium_status'",
      { type: QueryTypes.SELECT }
    );
    
    if (userColumns.length === 0) {
      await sequelize.query(`
        ALTER TABLE users ADD COLUMN premium_status VARCHAR(20) DEFAULT 'freemium';
        ALTER TABLE users ADD COLUMN premium_expires_at TIMESTAMP;
      `);
      console.log('✅ Added premium fields to users table');
    } else {
      console.log('✅ Premium fields already exist in users table');
    }
    
    // Add new fields to bots table if they don't exist (PostgreSQL syntax)
    const botColumns = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bots' AND column_name = 'has_donation_enabled'",
      { type: QueryTypes.SELECT }
    );
    
    if (botColumns.length === 0) {
      await sequelize.query(`
        ALTER TABLE bots ADD COLUMN has_donation_enabled BOOLEAN DEFAULT false;
        ALTER TABLE bots ADD COLUMN pinned_start_message TEXT;
        ALTER TABLE bots ADD COLUMN user_count INTEGER DEFAULT 0;
      `);
      console.log('✅ Added new feature fields to bots table');
    } else {
      console.log('✅ New feature fields already exist in bots table');
    }
    
    console.log('🎉 PostgreSQL subscription tables setup complete!');
    
  } catch (error) {
    console.error('❌ Error creating subscription tables:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createSubscriptionTables()
    .then(() => {
      console.log('✅ PostgreSQL database migration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ PostgreSQL database migration failed:', error);
      process.exit(1);
    });
}

module.exports = createSubscriptionTables;