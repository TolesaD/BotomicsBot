const { Bot } = require('../models');

async function activateAllBots() {
  try {
    console.log('🔄 Activating all bots in database...');
    
    // Get all bots first to see what we're working with
    const allBots = await Bot.findAll();
    
    console.log(`📊 Found ${allBots.length} total bots in database`);
    
    if (allBots.length === 0) {
      console.log('❌ No bots found in database. You need to create bots first using /createbot');
      return 0;
    }
    
    // Count active vs inactive
    const activeBots = allBots.filter(bot => bot.is_active);
    const inactiveBots = allBots.filter(bot => !bot.is_active);
    
    console.log(`📊 Currently active: ${activeBots.length}`);
    console.log(`📊 Currently inactive: ${inactiveBots.length}`);
    
    if (inactiveBots.length === 0) {
      console.log('✅ All bots are already active!');
      return activeBots.length;
    }
    
    // Activate all inactive bots
    const [affectedRows] = await Bot.update(
      { is_active: true }, 
      { where: { is_active: false } }
    );
    
    console.log(`✅ Activated ${affectedRows} bots`);
    
    // Verify the activation
    const updatedActiveBots = await Bot.count({ where: { is_active: true } });
    console.log(`✅ Total active bots now: ${updatedActiveBots}`);
    
    // Show which bots were activated
    console.log('\n🤖 Activated bots:');
    inactiveBots.forEach(bot => {
      console.log(`   - ${bot.bot_name} (ID: ${bot.id}, Owner: ${bot.owner_id})`);
    });
    
    return affectedRows;
    
  } catch (error) {
    console.error('❌ Error activating bots:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  activateAllBots()
    .then(count => {
      console.log(`🎉 Successfully activated ${count} bots!`);
      console.log('\n🔄 Now restart your application to initialize the mini-bots.');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Failed to activate bots:', error);
      process.exit(1);
    });
}

module.exports = activateAllBots;