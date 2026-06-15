/**
 * NovaCoin Exchange API - Vercel Serverless Entry Point
 * 
 * This file is the entry point for Vercel serverless deployment.
 * It initializes the database and market engine on cold starts,
 * then exports the Express app for Vercel's @vercel/node runtime.
 */

const { initializeDatabase, prepare, saveDatabase } = require('../src/database');
const marketEngine = require('../src/market-engine');
const app = require('../src/app');

// Track initialization state
let initialized = false;
let initPromise = null;

/**
 * Initialize the database and market engine.
 * On Vercel, this runs once per cold start.
 */
async function initialize() {
  if (initialized) return;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    try {
      await initializeDatabase();
      
      // Seed chart data if empty
      const countRow = await prepare('SELECT COUNT(*) as count FROM price_history').get();
      const count = countRow ? countRow.count : 0;
      
      if (count === 0) {
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
          const minP = basePrice * 0.95;
          const maxP = basePrice * 1.05;
          histPrice = Math.max(minP, Math.min(maxP, histPrice));
          histPrice = Math.round(histPrice * 10000000) / 10000000;
          const secondsAgo = sevenDaysSeconds - (i * step);
          const timestamp = new Date((now - secondsAgo) * 1000).toISOString();
          await prepare('INSERT INTO price_history (price, volume, timestamp) VALUES (?, ?, ?)')
            .run(histPrice, 0, timestamp);
        }
        const latestTs = new Date(now * 1000).toISOString();
        await prepare('INSERT INTO price_history (price, volume, timestamp) VALUES (?, ?, ?)')
          .run(basePrice, 0, latestTs);
        saveDatabase();
      }
      
      await marketEngine.init(prepare, null, saveDatabase);
      initialized = true;
      console.log('✅ NovaCoin API initialized for Vercel');
    } catch (e) {
      console.error('❌ Initialization error:', e.message);
      initPromise = null;
      throw e;
    }
  })();
  
  return initPromise;
}

// Wrap the app to ensure initialization before handling requests
const wrappedApp = async (req, res) => {
  try {
    await initialize();
    app(req, res);
  } catch (e) {
    res.status(500).json({ 
      error: 'เกิดข้อผิดพลาดในการเริ่มต้นระบบ',
      detail: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
};

// Export for Vercel
module.exports = wrappedApp;
