// 📁 scripts/quickDatabaseCheck.js - SIMPLE VERSION
const { Pool } = require('pg');

async function quickCheck() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 Quick Database Check...');
    
    const client = await pool.connect();
    
    // Count total bots
    const botResult = await client.query('SELECT COUNT(*) as count FROM bots');
    console.log(`🤖 Total Bots: ${botResult.rows[0].count}`);
    
    // Count total user logs
    const logResult = await client.query('SELECT COUNT(*) as count FROM user_log');
    console.log(`📊 Total User Logs: ${logResult.rows[0].count}`);
    
    // Check for orphaned records
    const orphanResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM user_log ul 
      LEFT JOIN bots b ON ul.bot_id = b.id 
      WHERE b.id IS NULL
    `);
    
    console.log(`❌ Orphaned Records: ${orphanResult.rows[0].count}`);
    
    if (orphanResult.rows[0].count > 0) {
      // Get details of orphaned records
      const detailResult = await client.query(`
        SELECT ul.bot_id, COUNT(*) as record_count, 
               MAX(ul.last_interaction) as latest_interaction
        FROM user_log ul 
        LEFT JOIN bots b ON ul.bot_id = b.id 
        WHERE b.id IS NULL
        GROUP BY ul.bot_id
        ORDER BY record_count DESC
        LIMIT 10
      `);
      
      console.log('\n📋 Orphaned Bot IDs:');
      detailResult.rows.forEach(row => {
        console.log(`   - Bot ID: ${row.bot_id}, Records: ${row.record_count}, Latest: ${row.latest_interaction}`);
      });
    } else {
      console.log('✅ No orphaned records found!');
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    await pool.end();
  }
}

quickCheck();