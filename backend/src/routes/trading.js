const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db, prepare, saveDatabase } = require('../database');
const { authenticate } = require('../middleware/auth');
const marketEngine = require('../market-engine');

const router = express.Router();

// POST /api/trading/place-order - Place buy/sell order (instant execution at market price)
router.post('/place-order', authenticate, async (req, res) => {
  try {
    const { type, amount, price } = req.body;
    
    // Validate required fields
    if (!type || !amount || !price) {
      return res.status(400).json({ error: 'กรุณาระบุข้อมูลให้ครบถ้วน' });
    }
    
    // Validate type
    if (!['buy', 'sell'].includes(type)) {
      return res.status(400).json({ error: 'ประเภทคำสั่งไม่ถูกต้อง' });
    }

    // Parse and validate numeric values
    const amountNum = parseFloat(amount);
    const priceNum = parseFloat(price);
    
    if (isNaN(amountNum) || isNaN(priceNum)) {
      return res.status(400).json({ error: 'จำนวนและราคาต้องเป็นตัวเลข' });
    }
    if (amountNum <= 0 || priceNum <= 0) {
      return res.status(400).json({ error: 'จำนวนและราคาต้องมากกว่า 0' });
    }
    
    // Sanity checks - prevent extreme values
    if (amountNum > 100000000) {
      return res.status(400).json({ error: 'จำนวนมากเกินไป' });
    }
    if (priceNum > 1000000 || priceNum < 0.0000001) {
      return res.status(400).json({ error: 'ราคาไม่อยู่ในช่วงที่กำหนด' });
    }
    if (amountNum * priceNum > 1000000000) {
      return res.status(400).json({ error: 'มูลค่าคำสั่งซื้อขายมากเกินไป' });
    }

    const minAmount = type === 'buy' ? 100 : 10;
    if (amountNum < minAmount) {
      return res.status(400).json({ error: `จำนวนขั้นต่ำ ${minAmount} ${type === 'buy' ? 'บาท' : 'NVC'}` });
    }

    const totalValue = amountNum * priceNum;

    // Check balance
    const debitCurrency = type === 'buy' ? 'THB' : 'NVC';
    const creditCurrency = type === 'buy' ? 'NVC' : 'THB';
    const debitAmount = type === 'buy' ? totalValue : amountNum;

    const debitWallet = await prepare('SELECT * FROM wallets WHERE user_id = ? AND currency = ?')
      .get(req.userId, debitCurrency);
    if (!debitWallet) {
      return res.status(400).json({ error: 'ไม่พบกระเป๋าเงิน' });
    }
    const availableBalance = debitWallet.balance - debitWallet.locked;
    if (availableBalance < debitAmount) {
      return res.status(400).json({
        error: `ยอดเงินไม่เพียงพอ ต้องการ ${debitAmount.toLocaleString()} ${debitCurrency} มี ${availableBalance.toLocaleString()} ${debitCurrency}`
      });
    }

    const creditWallet = await prepare('SELECT * FROM wallets WHERE user_id = ? AND currency = ?')
      .get(req.userId, creditCurrency);
    if (!creditWallet) {
      return res.status(400).json({ error: 'ไม่พบกระเป๋าเงิน' });
    }

    // === INSTANT EXECUTION ===
    const orderId = uuidv4();

    // 1. Debit (deduct) payment currency
    await prepare('UPDATE wallets SET balance = balance - ? WHERE id = ?')
      .run(debitAmount, debitWallet.id);

    // 2. Credit (add) received currency
    const creditAmount = type === 'buy' ? amountNum : totalValue;
    await prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?')
      .run(creditAmount, creditWallet.id);

    // 3. Record order as immediately filled
    await prepare(`
      INSERT INTO orders (id, user_id, type, price, amount, filled, status)
      VALUES (?, ?, ?, ?, ?, ?, 'filled')
    `).run(orderId, req.userId, type, priceNum, amountNum, amountNum);

    // 4. Record trade (use same orderId for both FK references since it's instant market execution)
    const tradeId = uuidv4();
    await prepare(`
      INSERT INTO trades (id, buy_order_id, sell_order_id, price, amount, total, buyer_id, seller_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tradeId, orderId, orderId,
      priceNum, amountNum, totalValue,
      req.userId, req.userId
    );

    // 5. Update price based on trade impact (buy = price up, sell = price down)
    await marketEngine.recordTrade(priceNum, amountNum, type, prepare, saveDatabase);

    res.status(201).json({
      message: type === 'buy' ? `ซื้อ NVC สำเร็จ! จำนวน ${amountNum.toFixed(4)} NVC` : `ขาย NVC สำเร็จ! รับ ${totalValue.toFixed(2)} THB`,
      orderId,
      status: 'filled',
      filledAmount: amountNum,
      totalValue
    });
  } catch (err) {
    console.error('Place order error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// Matching engine
async function matchOrder(newOrderId, type, price, amount, userId) {
  const oppositeType = type === 'buy' ? 'sell' : 'buy';
  const priceCondition = type === 'buy'
    ? 'price <= ?'
    : 'price >= ?';

  const matchingOrders = await prepare(`
    SELECT * FROM orders 
    WHERE type = ? AND status IN ('open', 'partial') AND user_id != ? AND ${priceCondition}
    ORDER BY price ${type === 'buy' ? 'ASC' : 'DESC'}, created_at ASC
  `).all(oppositeType, userId, price);

  let remainingAmount = amount;
  let matchCount = 0;

  for (const matchOrder of matchingOrders) {
    if (remainingAmount <= 0) break;

    const availableAmount = matchOrder.amount - matchOrder.filled;
    if (availableAmount <= 0) continue;

    const tradeAmount = Math.min(remainingAmount, availableAmount);
    const tradePrice = matchOrder.price;
    const totalValue = tradeAmount * tradePrice;

    // Create trade
    const tradeId = uuidv4();
    const buyerId = type === 'buy' ? userId : matchOrder.user_id;
    const sellerId = type === 'buy' ? matchOrder.user_id : userId;

    await prepare(`
      INSERT INTO trades (id, buy_order_id, sell_order_id, price, amount, total, buyer_id, seller_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tradeId,
      type === 'buy' ? newOrderId : matchOrder.id,
      type === 'sell' ? newOrderId : matchOrder.id,
      tradePrice, tradeAmount, totalValue, buyerId, sellerId
    );

    // Update balances
    // Buyer gets NVC
    const buyerNvc = await prepare("SELECT * FROM wallets WHERE user_id = ? AND currency = 'NVC'").get(buyerId);
    if (buyerNvc) {
      await prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?').run(tradeAmount, buyerNvc.id);
    }

    // Seller gets THB
    const sellerThb = await prepare("SELECT * FROM wallets WHERE user_id = ? AND currency = 'THB'").get(sellerId);
    if (sellerThb) {
      await prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?').run(totalValue, sellerThb.id);
    }

    // Release locked funds from matching order
    const matchingLockAmount = matchOrder.type === 'buy' ? tradeAmount * tradePrice : tradeAmount;
    const matchingWallet = await prepare('SELECT * FROM wallets WHERE user_id = ? AND currency = ?')
      .get(matchOrder.user_id, matchOrder.type === 'buy' ? 'THB' : 'NVC');
    if (matchingWallet) {
      await prepare('UPDATE wallets SET locked = GREATEST(0, locked - ?) WHERE id = ?')
        .run(matchingLockAmount, matchingWallet.id);
    }

    // Update new order filled
    await prepare('UPDATE orders SET filled = filled + ? WHERE id = ?').run(tradeAmount, newOrderId);

    // Update matching order status
    const newFilled = matchOrder.filled + tradeAmount;
    const newStatus = newFilled >= matchOrder.amount ? 'filled' : 'partial';
    await prepare('UPDATE orders SET filled = ?, status = ? WHERE id = ?').run(newFilled, newStatus, matchOrder.id);

    // Release locked from matching order
    const walletToUnlock = await prepare('SELECT * FROM wallets WHERE user_id = ? AND currency = ?')
      .get(matchOrder.user_id, matchOrder.type === 'buy' ? 'THB' : 'NVC');
    if (walletToUnlock) {
      await prepare('UPDATE wallets SET locked = GREATEST(0, locked - ?) WHERE id = ?')
        .run(matchingLockAmount, walletToUnlock.id);
    }

    remainingAmount -= tradeAmount;
    matchCount++;

    // Record price impact: new order type determines direction
    // (buy order = buy pressure → price up, sell order = sell pressure → price down)
    await marketEngine.recordTrade(tradePrice, tradeAmount, type, prepare, saveDatabase);
  }

  // Update new order status
  if (remainingAmount <= 0) {
    await prepare('UPDATE orders SET status = ? WHERE id = ?').run('filled', newOrderId);
  } else if (matchCount > 0) {
    await prepare('UPDATE orders SET status = "partial" WHERE id = ?').run(newOrderId);
  }

  // Release locked funds if fully matched
  if (remainingAmount <= 0) {
    const totalLocked = type === 'buy' ? amount * price : amount;
    await prepare('UPDATE wallets SET locked = GREATEST(0, locked - ?) WHERE user_id = ? AND currency = ?')
      .run(totalLocked, userId, type === 'buy' ? 'THB' : 'NVC');
  }

  return matchCount;
}

// GET /api/trading/orders - Get user's orders
router.get('/orders', authenticate, async (req, res) => {
  try {
    const orders = await prepare(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.userId);
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// DELETE /api/trading/cancel-order/:id
router.delete('/cancel-order/:id', authenticate, async (req, res) => {
  try {
    const order = await prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.userId);
    if (!order) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อขาย' });
    if (order.status === 'filled') return res.status(400).json({ error: 'ไม่สามารถยกเลิกคำสั่งที่ดำเนินการแล้ว' });

    const remainingAmount = order.amount - order.filled;
    const lockedAmount = order.type === 'buy' ? remainingAmount * order.price : remainingAmount;

    await prepare('UPDATE wallets SET locked = GREATEST(0, locked - ?) WHERE user_id = ? AND currency = ?')
      .run(lockedAmount, req.userId, order.type === 'buy' ? 'THB' : 'NVC');
    await prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(req.params.id);

    res.json({ message: 'ยกเลิกคำสั่งซื้อขายสำเร็จ' });
  } catch (err) {
    console.error('Cancel order error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/trading/orderbook
router.get('/orderbook', async (req, res) => {
  try {
    const bids = await prepare(`
      SELECT price, SUM(amount - filled) as volume
      FROM orders WHERE type = 'buy' AND status IN ('open', 'partial')
      GROUP BY price ORDER BY price DESC LIMIT 20
    `).all();

    const asks = await prepare(`
      SELECT price, SUM(amount - filled) as volume
      FROM orders WHERE type = 'sell' AND status IN ('open', 'partial')
      GROUP BY price ORDER BY price ASC LIMIT 20
    `).all();

    res.json({ bids, asks });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/trading/trades - Recent trades
router.get('/trades', async (req, res) => {
  try {
    const trades = await prepare(
      'SELECT * FROM trades ORDER BY created_at DESC LIMIT 50'
    ).all();
    res.json({ trades });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/trading/price-history
router.get('/price-history', async (req, res) => {
  try {
    const interval = req.query.interval || '7d';
    const limit = parseInt(req.query.limit) || 100;

    let timeFilter = '';
    switch (interval) {
      case '1h': timeFilter = "WHERE timestamp > datetime('now', '-1 hour')"; break;
      case '24h': timeFilter = "WHERE timestamp > datetime('now', '-1 day')"; break;
      case '7d': timeFilter = "WHERE timestamp > datetime('now', '-7 days')"; break;
      case '30d': timeFilter = "WHERE timestamp > datetime('now', '-30 days')"; break;
      default: timeFilter = "WHERE timestamp > datetime('now', '-7 days')"; break;
    }

    const history = await prepare(`
      SELECT price, volume, timestamp FROM price_history ${timeFilter}
      ORDER BY timestamp DESC LIMIT ?
    `).all(limit);

    res.json({ history: history.reverse() });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/trading/stats
router.get('/stats', async (req, res) => {
  try {
    const currentPriceSetting = await prepare("SELECT value FROM settings WHERE key = 'nvc_price'").get();
    const priceChangeSetting = await prepare("SELECT value FROM settings WHERE key = 'nvc_price_change_24h'").get();
    const marketCapSetting = await prepare("SELECT value FROM settings WHERE key = 'market_cap'").get();
    const volume24hSetting = await prepare("SELECT value FROM settings WHERE key = 'volume_24h'").get();
    const totalUsersSetting = await prepare("SELECT value FROM settings WHERE key = 'total_users'").get();

    const todayVolume = await prepare(`
      SELECT COALESCE(SUM(total), 0) as volume FROM trades 
      WHERE created_at > datetime('now', '-1 day')
    `).get();

    res.json({
      currentPrice: parseFloat(currentPriceSetting?.value || '2.00'),
      priceChange24h: priceChangeSetting?.value || '+0.00',
      marketCap: parseFloat(marketCapSetting?.value || '0'),
      volume24h: parseFloat(volume24hSetting?.value || '0'),
      volumeToday: todayVolume.volume,
      totalUsers: parseInt(totalUsersSetting?.value || '0'),
      symbol: 'NVC',
      name: 'NovaCoin'
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

module.exports = router;
