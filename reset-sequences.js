require('dotenv').config();
const { sequelize } = require('./database/db');

(async () => {
  try {
    const tables = ['feedback', 'bots', 'users', 'wallets', 'wallet_transactions'];
    for (const table of tables) {
      try {
        const [max] = await sequelize.query(SELECT COALESCE(MAX(id), 0) FROM );
        const maxId = max[0].max || 0;
        await sequelize.query(SELECT setval('_id_seq', , false));
        console.log(✅ : sequence reset to );
      } catch (e) {
        console.log(⚠️ : );
      }
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
