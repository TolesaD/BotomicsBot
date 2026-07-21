require('dotenv').config();
const { sequelize } = require('./database/db');
const fs = require('fs');

(async () => {
  try {
    await sequelize.authenticate();
    const [tables] = await sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const backup = {};
    for (const row of tables) {
      const [data] = await sequelize.query(SELECT * FROM );
      backup[row.table_name] = data;
    }
    fs.writeFileSync('./backup_data.json', JSON.stringify(backup, null, 2));
    console.log('✅ Database backup created: backup_data.json');
    process.exit(0);
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    process.exit(1);
  }
})();
