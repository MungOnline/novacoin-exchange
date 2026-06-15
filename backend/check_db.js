const initSqlJs = require('sql.js');
const fs = require('fs');

async function check() {
  const SQL = await initSqlJs();
  const DB_PATH = './data/novacoin.db';
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);
  
  const stmt = db.prepare('SELECT id, email, is_admin, is_banned FROM users');
  console.log('Users:');
  while (stmt.step()) {
    console.log(JSON.stringify(stmt.getAsObject()));
  }
  stmt.free();
  
  const stmt2 = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'deposit_%' OR key LIKE 'nvc_%'");
  console.log('\nSettings:');
  while (stmt2.step()) {
    console.log(JSON.stringify(stmt2.getAsObject()));
  }
  stmt2.free();
}
check().catch(console.error);
