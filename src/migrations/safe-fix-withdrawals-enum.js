const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../database/db');

async function safeFixWithdrawalsEnum() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🔄 Starting safe migration for withdrawals table...');
    
    // Step 1: Check current table structure and data
    const tableInfo = await sequelize.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'withdrawals' AND table_schema = 'public'
      ORDER BY ordinal_position
    `, { type: QueryTypes.SELECT, transaction });
    
    console.log('📊 Current withdrawals table structure:');
    tableInfo.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} (${col.udt_name})`);
    });
    
    // Step 2: Check current status values
    const statusValues = await sequelize.query(`
      SELECT DISTINCT status, COUNT(*) as count
      FROM withdrawals 
      GROUP BY status
    `, { type: QueryTypes.SELECT, transaction });
    
    console.log('📊 Current status values and counts:');
    statusValues.forEach(row => {
      console.log(`   "${row.status}": ${row.count} records`);
    });
    
    // Step 3: Create backup table
    console.log('💾 Creating backup table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS withdrawals_backup AS 
      TABLE withdrawals
    `, { transaction });
    
    console.log('✅ Backup table created: withdrawals_backup');
    
    // Step 4: Check if we need to handle enum conversion
    const statusColumn = tableInfo.find(col => col.column_name === 'status');
    
    if (statusColumn.udt_name === 'varchar' || statusColumn.data_type === 'character varying') {
      console.log('✅ Status column is already VARCHAR, checking values...');
      
      // Map any old values to new values if needed
      const valueMapping = {
        'approved': 'processing', // Map approved to processing
        // Add other mappings if needed
      };
      
      for (const [oldValue, newValue] of Object.entries(valueMapping)) {
        const result = await sequelize.query(`
          UPDATE withdrawals 
          SET status = $1
          WHERE status = $2
        `, { 
          bind: [newValue, oldValue],
          transaction 
        });
        
        if (result[1] > 0) {
          console.log(`🔄 Mapped ${result[1]} records from "${oldValue}" to "${newValue}"`);
        }
      }
      
    } else {
      console.log('🔄 Converting status column from enum to varchar...');
      
      // Step 5: Add temporary varchar column
      await sequelize.query(`
        ALTER TABLE withdrawals 
        ADD COLUMN status_varchar VARCHAR(50) DEFAULT 'pending'
      `, { transaction });
      
      // Step 6: Copy data from enum to varchar column
      await sequelize.query(`
        UPDATE withdrawals 
        SET status_varchar = status::VARCHAR
      `, { transaction });
      
      // Step 7: Map any old values to new values
      const valueMapping = {
        'approved': 'processing', // Map approved to processing
        // Add other mappings if needed
      };
      
      for (const [oldValue, newValue] of Object.entries(valueMapping)) {
        const result = await sequelize.query(`
          UPDATE withdrawals 
          SET status_varchar = $1
          WHERE status_varchar = $2
        `, { 
          bind: [newValue, oldValue],
          transaction 
        });
        
        if (result[1] > 0) {
          console.log(`🔄 Mapped ${result[1]} records from "${oldValue}" to "${newValue}"`);
        }
      }
      
      // Step 8: Drop the old enum column
      await sequelize.query(`
        ALTER TABLE withdrawals 
        DROP COLUMN status
      `, { transaction });
      
      // Step 9: Rename the varchar column
      await sequelize.query(`
        ALTER TABLE withdrawals 
        RENAME COLUMN status_varchar TO status
      `, { transaction });
    }
    
    // Step 10: Add constraint for valid status values (matching your model)
    try {
      await sequelize.query(`
        ALTER TABLE withdrawals 
        DROP CONSTRAINT IF EXISTS withdrawals_status_check
      `, { transaction });
      
      await sequelize.query(`
        ALTER TABLE withdrawals 
        ADD CONSTRAINT withdrawals_status_check 
        CHECK (status IN ('pending', 'processing', 'completed', 'rejected'))
      `, { transaction });
      
      console.log('✅ Added constraint for status values: pending, processing, completed, rejected');
    } catch (constraintError) {
      console.log('⚠️ Could not add constraint (may already exist or contain invalid data)');
    }
    
    // Step 11: Verify the migration
    const finalStatusValues = await sequelize.query(`
      SELECT DISTINCT status, COUNT(*) as count
      FROM withdrawals 
      GROUP BY status
    `, { type: QueryTypes.SELECT, transaction });
    
    console.log('✅ Final status values after migration:');
    finalStatusValues.forEach(row => {
      console.log(`   "${row.status}": ${row.count} records`);
    });
    
    const totalRecords = await sequelize.query(
      'SELECT COUNT(*) as count FROM withdrawals',
      { type: QueryTypes.SELECT, transaction }
    );
    
    console.log(`📊 Total records in withdrawals: ${totalRecords[0].count}`);
    
    await transaction.commit();
    console.log('🎉 Safe migration completed successfully!');
    console.log('📦 Backup saved in: withdrawals_backup');
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Migration failed, transaction rolled back:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  safeFixWithdrawalsEnum()
    .then(() => {
      console.log('✅ Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = safeFixWithdrawalsEnum;