const { sequelize } = require('../database/db');
const { QueryTypes } = require('sequelize');

async function createAdvancedTables() {
  try {
    console.log('🔄 Creating advanced feature tables...');
    
    // Channel Joins Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS channel_joins (
        id SERIAL PRIMARY KEY,
        bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        channel_id VARCHAR(255) NOT NULL,
        channel_username VARCHAR(255) NOT NULL,
        channel_title VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, { type: QueryTypes.RAW });
    
    console.log('✅ Created channel_joins table');
    
    // Referral Program Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS referral_programs (
        id SERIAL PRIMARY KEY,
        bot_id INTEGER NOT NULL UNIQUE REFERENCES bots(id) ON DELETE CASCADE,
        is_enabled BOOLEAN DEFAULT false,
        referral_rate DECIMAL(10,2) DEFAULT 1.00,
        min_withdrawal DECIMAL(10,2) DEFAULT 10.00,
        currency VARCHAR(10) DEFAULT 'ETB',
        required_channels JSON DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, { type: QueryTypes.RAW });
    
    console.log('✅ Created referral_programs table');
    
    // Referrals Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        referrer_id BIGINT NOT NULL,
        referred_id BIGINT NOT NULL,
        referral_code VARCHAR(255) NOT NULL,
        amount_earned DECIMAL(10,2) DEFAULT 0.00,
        is_completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, { type: QueryTypes.RAW });
    
    console.log('✅ Created referrals table');
    
    // Withdrawals Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'ETB',
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
        payment_method VARCHAR(255) NOT NULL,
        payment_details JSON NULL,
        admin_notes TEXT NULL,
        processed_by BIGINT NULL,
        processed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, { type: QueryTypes.RAW });
    
    console.log('✅ Created withdrawals table');
    
    // User Bans Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS user_bans (
        id SERIAL PRIMARY KEY,
        bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL,
        banned_by BIGINT NOT NULL,
        reason TEXT NULL,
        is_active BOOLEAN DEFAULT true,
        banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        unbanned_at TIMESTAMP NULL,
        unbanned_by BIGINT NULL
      )
    `, { type: QueryTypes.RAW });
    
    console.log('✅ Created user_bans table');
    
    // Create indexes for better performance
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_channel_joins_bot_id ON channel_joins(bot_id);
      CREATE INDEX IF NOT EXISTS idx_channel_joins_channel_id ON channel_joins(channel_id);
      
      CREATE INDEX IF NOT EXISTS idx_referrals_bot_referrer ON referrals(bot_id, referrer_id);
      CREATE INDEX IF NOT EXISTS idx_referrals_referral_code ON referrals(referral_code);
      CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON referrals(referred_id);
      
      CREATE INDEX IF NOT EXISTS idx_withdrawals_bot_user ON withdrawals(bot_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
      
      CREATE INDEX IF NOT EXISTS idx_user_bans_bot_user ON user_bans(bot_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_user_bans_is_active ON user_bans(is_active);
    `, { type: QueryTypes.RAW });
    
    console.log('✅ Created indexes for advanced features');
    
    console.log('🎉 All advanced feature tables created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating advanced tables:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createAdvancedTables()
    .then(() => {
      console.log('✅ Database migration completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Database migration failed:', error);
      process.exit(1);
    });
}

module.exports = createAdvancedTables;