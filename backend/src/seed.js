require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { prepare, initializeDatabase } = require('./database');

async function seed() {
  await initializeDatabase();
  console.log('\n🌱 Seeding database...\n');

  // Check if admin exists
  const existingAdmin = await prepare("SELECT id FROM users WHERE email = ?").get(process.env.ADMIN_EMAIL || 'admin@novacoin.io');
  if (existingAdmin) {
    console.log('✅ Admin already exists, skipping...');
  } else {
    const adminId = uuidv4();
    const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@123456', 12);

    await prepare(`
      INSERT INTO users (id, email, password, full_name, is_admin, email_verified)
      VALUES (?, ?, ?, ?, 1, 1)
    `).run(adminId, process.env.ADMIN_EMAIL || 'admin@novacoin.io', hashedPassword, 'Admin NovaCoin');

    await prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), adminId, 'THB', 1000000);
    await prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), adminId, 'NVC', 500000);

    console.log(`✅ Created admin: ${process.env.ADMIN_EMAIL || 'admin@novacoin.io'}`);
    console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'Admin@123456'}`);
  }

  // Update settings with current price
  await prepare("UPDATE settings SET value = ? WHERE key = 'nvc_price'").run('0.0004546');
  await prepare("UPDATE settings SET value = ? WHERE key = 'nvc_price_change_24h'").run('+0.00');
  await prepare("UPDATE settings SET value = ? WHERE key = 'market_cap'").run('0');
  await prepare("UPDATE settings SET value = ? WHERE key = 'volume_24h'").run('0');

  const userCount = await prepare('SELECT COUNT(*) as count FROM users').get();
  await prepare("UPDATE settings SET value = ? WHERE key = 'total_users'").run(String(userCount.count));

  const priceHistoryCount = await prepare('SELECT COUNT(*) as count FROM price_history').get();

  console.log('\n🎉 Seed completed!');
  console.log(`   👤 Users: ${userCount.count}`);
  console.log(`   📊 Price History: ${priceHistoryCount.count} points`);
  console.log('\n🚀 Run "npm start" to launch the server!\n');
}

seed().catch(console.error);
