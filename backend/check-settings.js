const { prepare, initializeDatabase } = require('./src/database');
initializeDatabase().then(() => {
  const price = prepare("SELECT value FROM settings WHERE key = 'nvc_price'").get();
  const change = prepare("SELECT value FROM settings WHERE key = 'nvc_price_change_24h'").get();
  console.log('nvc_price:', price?.value);
  console.log('nvc_price_change_24h:', change?.value);
  const count = prepare('SELECT COUNT(*) as cnt FROM price_history').get();
  console.log('price_history count:', count?.cnt);
});
