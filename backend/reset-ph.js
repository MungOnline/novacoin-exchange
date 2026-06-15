const { prepare, initializeDatabase } = require('./src/database');
async function reset() {
  await initializeDatabase();
  prepare('DELETE FROM price_history').run();
  console.log('✅ Deleted all price_history records');
}
reset().catch(console.error);
