/**
 * Real-time Market Engine
 * 
 * Price ONLY moves when real trades happen:
 * - Buy  → Price goes UP  (buy pressure)
 * - Sell → Price goes DOWN (sell pressure)
 * 
 * No random ticks, no artificial movement.
 * Price stays stable when no one is trading.
 */

const { v4: uuidv4 } = require('uuid');

let currentPrice = 0.0004546;
let priceHistoryCount = 0;

// Liquidity pool depth for price impact calculation
// Lower = more volatile (more impact per trade)
// A trade of LIQUIDITY_DEPTH THB moves price by ~100%
const LIQUIDITY_DEPTH = 500; // THB equivalent
const MIN_IMPACT = 0.0005; // Minimum 0.05% change to be visible at 7 decimals
const MAX_IMPACT_PER_TRADE = 0.10; // Max 10% price change per trade
const MIN_PRICE = 0.0000001;
const MAX_PRICE = 0.01;

/**
 * Initialize market engine with current price from database
 */
async function init(prepare, db, saveDatabase) {
  // Get current price from database
  try {
    const setting = await prepare("SELECT value FROM settings WHERE key = 'nvc_price'").get();
    if (setting) {
      currentPrice = parseFloat(setting.value) || 0.0004546;
    }
  } catch (e) {
    currentPrice = 0.0004546;
  }

  // Count existing price history
  try {
    const count = await prepare("SELECT COUNT(*) as count FROM price_history").get();
    priceHistoryCount = count ? count.count : 0;
  } catch (e) {
    priceHistoryCount = 0;
  }

  console.log(`📈 Market Engine: Price driven by real trades only`);
  console.log(`   Current price: ${currentPrice.toFixed(7)} THB`);
  console.log(`   Price history points: ${priceHistoryCount}`);
}

/**
 * Record a trade and calculate price impact
 * @param {number} tradePrice - The execution price
 * @param {number} amount - Amount of NVC traded
 * @param {string} type - 'buy' or 'sell'
 * @param {object} prepare - Database prepare function
 * @param {function} saveDatabase - Database save function
 * @returns {Promise<number>} The new price
 */
async function recordTrade(tradePrice, amount, type, prepare, saveDatabase) {
  try {
    const tradeValue = tradePrice * amount;

    // Calculate price impact
    // Buy: price increases proportional to trade value vs liquidity
    // Sell: price decreases proportional to trade value vs liquidity
    let impact = tradeValue / LIQUIDITY_DEPTH;
    
    // Ensure minimum impact so every trade visibly moves the price
    if (impact < MIN_IMPACT) impact = MIN_IMPACT;
    
    // Cap maximum impact
    impact = Math.min(impact, MAX_IMPACT_PER_TRADE);

    // Apply impact
    let newPrice;
    if (type === 'buy') {
      // Buy pressure: price goes up
      newPrice = currentPrice * (1 + impact);
    } else {
      // Sell pressure: price goes down
      newPrice = currentPrice / (1 + impact);
    }

    // Clamp to allowed range
    newPrice = Math.max(MIN_PRICE, Math.min(MAX_PRICE, newPrice));
    newPrice = Math.round(newPrice * 10000000) / 10000000;

    // Update current price
    currentPrice = newPrice;

    // Write to database
    try {
      await prepare('INSERT INTO price_history (price, volume, timestamp) VALUES (?, ?, datetime(\'now\'))')
        .run(currentPrice, amount);
      await prepare("UPDATE settings SET value = ? WHERE key = 'nvc_price'")
        .run(currentPrice.toString());
      
      // Update 24h price change
      const oldPrice = await prepare(`
        SELECT price FROM price_history 
        WHERE timestamp <= datetime('now', '-1 day') 
        ORDER BY timestamp DESC LIMIT 1
      `).get();
      
      if (oldPrice && oldPrice.price > 0) {
        const change = ((currentPrice - oldPrice.price) / oldPrice.price * 100);
        const changeStr = (change >= 0 ? '+' : '') + change.toFixed(2);
        await prepare("UPDATE settings SET value = ? WHERE key = 'nvc_price_change_24h'")
          .run(changeStr);
      }

      saveDatabase();
      priceHistoryCount++;
    } catch (e) {
      console.error('Failed to write trade data:', e.message);
    }

    return currentPrice;
  } catch (e) {
    console.error('recordTrade error:', e.message);
    return currentPrice;
  }
}

function getCurrentPrice() {
  return currentPrice;
}

function stop() {
  console.log('📈 Market Engine: Stopped');
}

module.exports = { init, recordTrade, getCurrentPrice, stop };
