// 📁 scripts/checkCustomBot.js
require('dotenv').config();
const { Bot } = require('../src/models');

async function checkCustomBot() {
  try {
    console.log('🔍 Checking custom bot data...');
    
    // Get the latest bot (your newly created custom bot)
    const latestBot = await Bot.findOne({
      order: [['id', 'DESC']]
    });
    
    if (latestBot) {
      console.log('\n📋 Latest Bot Details:');
      console.log(`   ID: ${latestBot.id}`);
      console.log(`   Name: ${latestBot.bot_name}`);
      console.log(`   Type: ${latestBot.bot_type}`);
      console.log(`   Username: ${latestBot.bot_username}`);
      console.log(`   Has Custom Flow: ${!!latestBot.custom_flow_data}`);
      
      if (latestBot.custom_flow_data) {
        console.log(`   Custom Flow Steps: ${latestBot.custom_flow_data.steps?.length || 0}`);
        console.log(`   Welcome Message: ${latestBot.custom_flow_data.welcome_message ? 'Yes' : 'No'}`);
      }
    }
    
    // Count bot types
    const quickBots = await Bot.count({ where: { bot_type: 'quick' } });
    const customBots = await Bot.count({ where: { bot_type: 'custom' } });
    
    console.log('\n📊 Bot Type Summary:');
    console.log(`   Quick Bots: ${quickBots}`);
    console.log(`   Custom Bots: ${customBots}`);
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkCustomBot();