// scripts/dev-bot-manager.js - Development bot management
const { Bot } = require('../src/models');

async function listBots() {
  const bots = await Bot.findAll({ 
    where: { is_active: true },
    attributes: ['id', 'bot_name', 'bot_username', 'owner_id', 'is_active']
  });
  
  console.log('\n🤖 ACTIVE MINI BOTS:');
  console.log('==================');
  bots.forEach(bot => {
    console.log(`- ${bot.bot_name} (ID: ${bot.id}) - @${bot.bot_username} - Owner: ${bot.owner_id}`);
  });
  console.log(`\nTotal: ${bots.length} active bots`);
}

async function deactivateBot(botNameOrId) {
  const where = isNaN(botNameOrId) 
    ? { bot_name: botNameOrId }
    : { id: parseInt(botNameOrId) };
  
  const bot = await Bot.findOne({ where });
  
  if (!bot) {
    console.log(`❌ Bot not found: ${botNameOrId}`);
    return;
  }
  
  await bot.update({ is_active: false });
  console.log(`✅ Deactivated: ${bot.bot_name} (ID: ${bot.id})`);
}

async function activateBot(botNameOrId) {
  const where = isNaN(botNameOrId) 
    ? { bot_name: botNameOrId }
    : { id: parseInt(botNameOrId) };
  
  const bot = await Bot.findOne({ where });
  
  if (!bot) {
    console.log(`❌ Bot not found: ${botNameOrId}`);
    return;
  }
  
  await bot.update({ is_active: true });
  console.log(`✅ Activated: ${bot.bot_name} (ID: ${bot.id})`);
}

// Command line interface
const command = process.argv[2];
const argument = process.argv[3];

async function main() {
  switch (command) {
    case 'list':
      await listBots();
      break;
    case 'deactivate':
      if (!argument) {
        console.log('Usage: node scripts/dev-bot-manager.js deactivate <bot-name-or-id>');
        return;
      }
      await deactivateBot(argument);
      break;
    case 'activate':
      if (!argument) {
        console.log('Usage: node scripts/dev-bot-manager.js activate <bot-name-or-id>');
        return;
      }
      await activateBot(argument);
      break;
    default:
      console.log('🤖 Development Bot Manager');
      console.log('========================');
      console.log('Commands:');
      console.log('  list                    - List all active bots');
      console.log('  deactivate <name|id>    - Deactivate a specific bot');
      console.log('  activate <name|id>      - Activate a specific bot');
      console.log('\nExamples:');
      console.log('  node scripts/dev-bot-manager.js list');
      console.log('  node scripts/dev-bot-manager.js deactivate match');
      console.log('  node scripts/dev-bot-manager.js activate 5');
  }
}

main().catch(console.error);