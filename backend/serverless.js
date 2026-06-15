/**
 * NovaCoin Exchange - Vercel Serverless Entry Point
 * 
 * This file is the entry point for Vercel deployment.
 * It initializes the database and market engine on cold starts,
 * then exports the Express app for Vercel's @vercel/node runtime.
 * 
 * DO NOT put this in the api/ directory — Vercel treats /api/* specially
 * and causes routing conflicts.
 */

require('dotenv').config();

const { initializeDatabase, prepare, saveDatabase } = require('./src/database');
const marketEngine = require('./src/market-engine');
const app = require('./src/app');

let initialized = false;
let initPromise = null;

async function initialize() {
  if (initialized) return;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    try {
      console.log('🚀 Initializing NovaCoin API for Vercel...');
      await initializeDatabase();
      await seedChartData(prepare, saveDatabase);
      await seedAdminUsers(prepare, saveDatabase);
      await marketEngine.init(prepare, null, saveDatabase);
      initialized = true;
      console.log('✅ NovaCoin API initialized');
    } catch (e) {
      console.error('❌ Initialization error:', e.message, e.stack);
      initPromise = null;
      throw e;
    }
  })();
  
  return initPromise;
}

async function seedAdminUsers(prepare, saveDatabase) {
  try {
    // Check if admin already exists
    const existing = await prepare("SELECT id FROM users WHERE email = ?").get('admin@novacoin.io');
    if (existing) {
      console.log('👤 Admin user already exists, skipping seed');
      return;
    }

    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    
    // Create admin user
    const adminId = uuidv4();
    const hashedPassword = await bcrypt.hash('Admin@123456', 10);
    const now = new Date().toISOString();
    
    await prepare(`
      INSERT INTO users (id, email, password, full_name, is_admin, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1, ?, ?)
    `).run(adminId, 'admin@novacoin.io', hashedPassword, 'Admin', now, now);
    
    // Create wallets for admin (THB 100,000,000 and NVC 5,000,000)
    await prepare(`
      INSERT INTO wallets (id, user_id, currency, balance, locked, created_at, updated_at)
      VALUES (?, ?, 'THB', 100000000, 0, ?, ?)
    `).run(uuidv4(), adminId, now, now);
    
    await prepare(`
      INSERT INTO wallets (id, user_id, currency, balance, locked, created_at, updated_at)
      VALUES (?, ?, 'NVC', 5000000, 0, ?, ?)
    `).run(uuidv4(), adminId, now, now);
    
    // Create MungOnline admin user
    const mungId = uuidv4();
    const mungHashed = await bcrypt.hash('54321T_tt', 10);
    
    await prepare(`
      INSERT INTO users (id, email, password, full_name, is_admin, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1, ?, ?)
    `).run(mungId, 'mungonline@novacoin.io', mungHashed, 'MungOnline', now, now);
    
    await prepare(`
      INSERT INTO wallets (id, user_id, currency, balance, locked, created_at, updated_at)
      VALUES (?, ?, 'THB', 10000000, 0, ?, ?)
    `).run(uuidv4(), mungId, now, now);
    
    await prepare(`
      INSERT INTO wallets (id, user_id, currency, balance, locked, created_at, updated_at)
      VALUES (?, ?, 'NVC', 5000000, 0, ?, ?)
    `).run(uuidv4(), mungId, now, now);
    
    saveDatabase();
    console.log('👤 Admin users seeded successfully');
  } catch (e) {
    console.error('Seed admin error:', e.message);
  }
}

async function seedChartData(prepare, saveDatabase) {
  try {
    const countRow = await prepare('SELECT COUNT(*) as count FROM price_history').get();
    const count = countRow ? countRow.count : 0;
    if (count > 0) return;
    
    const priceSetting = await prepare("SELECT value FROM settings WHERE key = 'nvc_price'").get();
    const basePrice = parseFloat(priceSetting?.value || '0.0004546');
    const now = Math.floor(Date.now() / 1000);
    let histPrice = basePrice;
    const sevenDaysSeconds = 7 * 24 * 3600;
    const step = Math.floor(sevenDaysSeconds / 128);
    
    for (let i = 0; i < 128; i++) {
      const drift = (basePrice - histPrice) * 0.02;
      const noise = (Math.random() - 0.5) * basePrice * 0.02;
      histPrice = histPrice + drift + noise;
      histPrice = Math.max(basePrice * 0.95, Math.min(basePrice * 1.05, histPrice));
      histPrice = Math.round(histPrice * 10000000) / 10000000;
      const secondsAgo = sevenDaysSeconds - (i * step);
      const timestamp = new Date((now - secondsAgo) * 1000).toISOString();
      await prepare('INSERT INTO price_history (price, volume, timestamp) VALUES (?, ?, ?)')
        .run(histPrice, 0, timestamp);
    }
    await prepare('INSERT INTO price_history (price, volume, timestamp) VALUES (?, ?, ?)')
      .run(basePrice, 0, new Date(now * 1000).toISOString());
    saveDatabase();
    console.log('📊 Chart data seeded');
  } catch (e) {
    console.error('Seed chart error:', e.message);
  }
}

// Wrap the app to ensure initialization before handling requests
const handler = async (req, res) => {
  try {
    await initialize();
    app(req, res);
  } catch (e) {
    console.error('Handler error:', e.message);
    res.status(500).json({ 
      error: 'เกิดข้อผิดพลาดในการเริ่มต้นระบบ',
      message: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
};

module.exports = handler;
