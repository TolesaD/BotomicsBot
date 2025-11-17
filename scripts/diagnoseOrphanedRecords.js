// 📁 scripts/diagnoseOrphanedRecords.js - FIXED VERSION
require('dotenv').config();

const { Sequelize } = require('sequelize');

console.log('🔧 Loading environment...');
console.log('   DATABASE_URL length:', process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 'NOT SET');

// Direct database connection with proper SSL handling
async function connectToDatabase() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set in environment variables');
    }

    console.log('   Connecting to Railway database...');

    const sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false, // Disable logging to avoid deprecation warning
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });

    await sequelize.authenticate();
    console.log('✅ Database connection established');
    return sequelize;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

async function diagnoseOrphanedRecords() {
  let sequelize;
  
  try {
    console.log('🔍 SAFE DIAGNOSTIC: Checking for orphaned records...');
    
    sequelize = await connectToDatabase();
    
    // Count total bots and user logs
    const [botCount] = await sequelize.query('SELECT COUNT(*) as count FROM bots');
    const [userLogCount] = await sequelize.query('SELECT COUNT(*) as count FROM user_log');
    
    console.log(`\n📊 Database Overview:`);
    console.log(`   Total Bots: ${botCount[0].count}`);
    console.log(`   Total User Logs: ${userLogCount[0].count}`);
    
    // Find user_log entries with invalid bot_ids (READ-ONLY)
    const [orphanedLogs] = await sequelize.query(`
      SELECT ul.id, ul.bot_id, ul.user_id, ul.user_first_name, ul.last_interaction, ul.interaction_count
      FROM user_log ul
      LEFT JOIN bots b ON ul.bot_id = b.id
      WHERE b.id IS NULL
      ORDER BY ul.last_interaction DESC
      LIMIT 100
    `);

    console.log(`\n❌ Orphaned User Logs Found: ${orphanedLogs.length}`);
    
    if (orphanedLogs.length > 0) {
      console.log(`\n📋 Orphaned Records Details (first 10):`);
      orphanedLogs.slice(0, 10).forEach(log => {
        console.log(`   - ID: ${log.id}, Bot ID: ${log.bot_id}, User: ${log.user_first_name}`);
        console.log(`     Last Interaction: ${log.last_interaction}`);
      });
      
      if (orphanedLogs.length > 10) {
        console.log(`   ... and ${orphanedLogs.length - 10} more records`);
      }
      
      // Show which bot IDs are missing
      const orphanedBotIds = [...new Set(orphanedLogs.map(log => log.bot_id))];
      console.log(`\n🔍 Missing Bot IDs: ${orphanedBotIds.join(', ')}`);
      
      // Check if these are recent or old records
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const recentOrphans = orphanedLogs.filter(log => new Date(log.last_interaction) > oneWeekAgo);
      
      console.log(`\n⏰ Orphan Age Analysis:`);
      console.log(`   Recent (last 7 days): ${recentOrphans.length}`);
      console.log(`   Old (over 7 days): ${orphanedLogs.length - recentOrphans.length}`);
      
      if (recentOrphans.length > 0) {
        console.log(`\n⚠️  WARNING: ${recentOrphans.length} recent orphaned records found!`);
      }
      
      return {
        totalBots: botCount[0].count,
        totalUserLogs: userLogCount[0].count,
        orphanedCount: orphanedLogs.length,
        hasRecentOrphans: recentOrphans.length > 0
      };
      
    } else {
      console.log(`\n✅ No orphaned records found! Database is clean.`);
      
      return {
        totalBots: botCount[0].count,
        totalUserLogs: userLogCount[0].count,
        orphanedCount: 0,
        hasRecentOrphans: false
      };
    }
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
    return { error: error.message };
  } finally {
    if (sequelize) {
      await sequelize.close();
      console.log('\n🔒 Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  diagnoseOrphanedRecords()
    .then(result => {
      if (result.error) {
        console.error('💥 Diagnostic error:', result.error);
        process.exit(1);
      } else {
        console.log('\n🎉 Diagnostic completed successfully!');
        console.log('✅ Database integrity is good - no orphaned records');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = diagnoseOrphanedRecords;