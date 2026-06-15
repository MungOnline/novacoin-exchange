const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { prepare, initializeDatabase } = require('./src/database');
async function run() {
  await initializeDatabase();
  const email = 'mungonline@novacoin.io';
  const existing = prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) { console.log('Already exists'); return; }
  const uid = uuidv4();
  prepare('INSERT INTO users (id, email, password, full_name, is_admin, email_verified) VALUES (?, ?, ?, ?, 1, 1)')
    .run(uid, email, bcrypt.hashSync('54321T_tt', 12), 'MungOnline');
  prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)').run(uuidv4(), uid, 'THB', 10000000);
  prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)').run(uuidv4(), uid, 'NVC', 5000000);
  console.log('✅ Created MungOnline admin');
}
run().catch(console.error);
