require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { prepare, initializeDatabase } = require('./database');

async function createAdmin() {
  await initializeDatabase();
  console.log('\n👤 Creating admin user...\n');

  const email = 'mungonline@novacoin.io';
  const password = '54321T_tt';
  const fullName = 'MungOnline';

  // Check if already exists
  const existing = await prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    console.log('⚠️  User already exists, skipping creation.');
    return;
  }

  const userId = uuidv4();
  const hashedPassword = bcrypt.hashSync(password, 12);

  await prepare(`
    INSERT INTO users (id, email, password, full_name, is_admin, email_verified)
    VALUES (?, ?, ?, ?, 1, 1)
  `).run(userId, email, hashedPassword, fullName);

  await prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), userId, 'THB', 1000000);
  await prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), userId, 'NVC', 500000);

  console.log('✅ Admin created successfully!');
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Name:     ${fullName}`);
  console.log(`   Admin:    Yes`);
  console.log(`   PIN:      141200 (same for all admins)`);
  console.log('');
}

createAdmin().catch(console.error);
