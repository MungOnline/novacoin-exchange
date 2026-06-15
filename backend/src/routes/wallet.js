const express = require('express');
const { prepare } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/wallet - Get user wallets
router.get('/', authenticate, async (req, res) => {
  try {
    const wallets = await prepare('SELECT * FROM wallets WHERE user_id = ?').all(req.userId);
    res.json({ wallets });
  } catch (err) {
    console.error('Get wallet error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/wallet/transactions - Get transaction history
router.get('/transactions', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Get trades
    const trades = await prepare(`
      SELECT id, 'trade' as type, price, amount, 
             CASE WHEN buyer_id = ? THEN 'buy' ELSE 'sell' END as action,
             total as value, created_at
      FROM trades
      WHERE buyer_id = ? OR seller_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.userId, req.userId, req.userId, limit, offset);

    // Get deposits
    const deposits = await prepare(`
      SELECT id, 'deposit' as type, amount, 'deposit' as action,
             amount as value, status, created_at
      FROM deposits
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.userId, limit, offset);

    // Combine and sort
    const transactions = [...trades, ...deposits]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    const tradeCount = await prepare(
      'SELECT COUNT(*) as count FROM trades WHERE buyer_id = ? OR seller_id = ?'
    ).get(req.userId, req.userId);

    const depositCount = await prepare(
      'SELECT COUNT(*) as count FROM deposits WHERE user_id = ?'
    ).get(req.userId);

    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total: tradeCount.count + depositCount.count,
        totalPages: Math.ceil((tradeCount.count + depositCount.count) / limit) || 1
      }
    });
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

module.exports = router;
