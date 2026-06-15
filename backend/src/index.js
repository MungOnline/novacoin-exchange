/**
 * NovaCoin Exchange Backend - Server Entry Point
 * 
 * This file is used for LOCAL DEVELOPMENT only.
 * For Vercel deployment, see api/index.js
 */

require('dotenv').config();

const app = require('./app');
const { initializeDatabase, prepare, saveDatabase } = require('./database');
const marketEngine = require('./market-engine');

const PORT = process.env.PORT || 5000;

// ============ REAL-TIME MARKET ENGINE ============

// Seed initial price history data so the chart always has data to display
async function seedInitialChartData() {
  try {
    const { prepare, saveDatabase } = require('./database');
    const countRow = await prepare('SELECT COUNT(*) as count FROM price_history').get();
    const count = countRow ? countRow.count : 0;
    
    if (count === 0) {
      const priceSetting = await prepare("SELECT value FROM settings WHERE key = 'nvc_price'").get();
      const basePrice = parseFloat(priceSetting?.value || '0.0004546');
      const now = Math.floor(Date.now() / 1000);
      let totalPoints = 0;
      
      let histPrice = basePrice;
      const sevenDaysSeconds = 7 * 24 * 3600;
      const step = Math.floor(sevenDaysSeconds / 128);
      
      for (let i = 0; i < 128; i++) {
        const drift = (basePrice - histPrice) * 0.02;
        const noise = (Math.random() - 0.5) * basePrice * 0.02;
        histPrice = histPrice + drift + noise;
        const minP = basePrice * 0.95;
        const maxP = basePrice * 1.05;
        histPrice = Math.max(minP, Math.min(maxP, histPrice));
        histPrice = Math.round(histPrice * 10000000) / 10000000;
        
        const secondsAgo = sevenDaysSeconds - (i * step);
        const timestamp = new Date((now - secondsAgo) * 1000).toISOString();
        
        await prepare('INSERT INTO price_history (price, volume, timestamp) VALUES (?, ?, ?)')
          .run(histPrice, 0, timestamp);
        totalPoints++;
      }
      const latestTs = new Date(now * 1000).toISOString();
      await prepare('INSERT INTO price_history (price, volume, timestamp) VALUES (?, ?, ?)')
        .run(basePrice, 0, latestTs);
      totalPoints++;
      
      saveDatabase();
      console.log(`   📊 Seeded ${totalPoints} initial price history data points for chart`);
    }
  } catch (e) {
    console.error('   ⚠️ Seed chart data error:', e.message);
  }
}

// Initialize database then start server
initializeDatabase().then(async () => {
  await seedInitialChartData();
  const { prepare, saveDatabase } = require('./database');
  await marketEngine.init(prepare, null, saveDatabase);
  
  app.listen(PORT, '0.0.0.0', () => {
    const dbMode = require('./database').IS_POSTGRES ? 'PostgreSQL (Neon)' : 'SQLite (sql.js)';
    console.log(`
  ╔══════════════════════════════════════════╗
  ║        NovaCoin Exchange API v1.0        ║
  ║──────────────────────────────────────────║
  ║  Server: http://localhost:${PORT}              ║
  ║  Status: 🟢 Running                      ║
  ║  Security: 🛡️ Active                     ║
  ║  DB: ${dbMode.padEnd(30)}║
  ╚══════════════════════════════════════════╝
    `);
  });
});
