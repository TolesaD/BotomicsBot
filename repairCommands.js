// repairCommands.js - Run this once to fix existing commands
const { CustomCommand } = require('./src/models');

async function repairCommands() {
  try {
    console.log('🔧 Repairing existing commands...');
    
    const commands = await CustomCommand.findAll();
    
    for (const command of commands) {
      if (command.flow_data && command.flow_data.blocks && command.flow_data.blocks.length > 0) {
        // Check if startBlockId is missing
        if (!command.flow_data.startBlockId) {
          // Set the first block as start
          command.flow_data.startBlockId = command.flow_data.blocks[0].id;
          await command.save();
          console.log(`✅ Fixed command: ${command.name} (ID: ${command.command_id})`);
        }
      }
    }
    
    console.log('🎉 Command repair completed');
  } catch (error) {
    console.error('❌ Repair failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  repairCommands();
}

module.exports = repairCommands;