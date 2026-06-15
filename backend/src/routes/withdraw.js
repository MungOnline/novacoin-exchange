const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { prepare } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const MIN_WITHDRAW_NVC = 100;
const MAX_WITHDRAW_NVC = 1000000;

// GET /api/withdraw/info - Get withdrawal info (current price, limits)
router.get('/info', async (req, res) => {
  try {
    const nvcPriceSetting = await prepare("SELECT value FROM settings WHERE key = 'nvc_price'").get();
    const nvcPrice = parseFloat(nvcPriceSetting?.value || '0.0004546');
    res.json({
      nvcPrice,
      minAmount: MIN_WITHDRAW_NVC,
      maxAmount: MAX_WITHDRAW_NVC,
      message: 'ถอนเหรียญ NVC เป็นเงินบาท'
    });
  } catch (err) {
    console.error('Get withdraw info error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/withdraw/create - Create a withdrawal request
router.post('/create', authenticate, async (req, res) => {
  try {
    const { amount, bank_name, bank_account, account_name } = req.body;

    // === VALIDATION ===
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'กรุณาระบุจำนวน NVC ที่ถูกต้อง' });
    }

    const amountNum = parseFloat(amount);
    if (amountNum < MIN_WITHDRAW_NVC) {
      return res.status(400).json({ error: `จำนวน NVC ขั้นต่ำ ${MIN_WITHDRAW_NVC.toLocaleString()} NVC` });
    }
    if (amountNum > MAX_WITHDRAW_NVC) {
      return res.status(400).json({ error: `จำนวน NVC สูงสุด ${MAX_WITHDRAW_NVC.toLocaleString()} NVC` });
    }
    if (!bank_name || !bank_name.trim()) {
      return res.status(400).json({ error: 'กรุณาระบุชื่อธนาคาร' });
    }
    if (!bank_account || !bank_account.trim()) {
      return res.status(400).json({ error: 'กรุณาระบุเลขที่บัญชี' });
    }
    if (!account_name || !account_name.trim()) {
      return res.status(400).json({ error: 'กรุณาระบุชื่อบัญชี' });
    }

    // Check user's NVC balance
    const nvcWallet = await prepare("SELECT * FROM wallets WHERE user_id = ? AND currency = 'NVC'")
      .get(req.userId);

    if (!nvcWallet || nvcWallet.balance < amountNum) {
      return res.status(400).json({ error: 'ยอด NVC ไม่เพียงพอ' });
    }

    // Get current NVC price for THB calculation
    const nvcPriceSetting = await prepare("SELECT value FROM settings WHERE key = 'nvc_price'").get();
    const nvcPrice = parseFloat(nvcPriceSetting?.value || '0.0004546');
    const thbAmount = Math.round(amountNum * nvcPrice * 100) / 100;

    if (thbAmount <= 0) {
      return res.status(400).json({ error: 'จำนวนเงินที่ได้รับน้อยเกินไป' });
    }

    // Lock NVC in user's wallet (deduct from balance, add to locked)
    await prepare('UPDATE wallets SET balance = balance - ?, locked = locked + ?, updated_at = datetime("now") WHERE id = ?')
      .run(amountNum, amountNum, nvcWallet.id);

    // Create withdrawal record
    const withdrawId = uuidv4();
    await prepare(`
      INSERT INTO withdrawals (id, user_id, amount, thb_amount, bank_name, bank_account, account_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(withdrawId, req.userId, amountNum, thbAmount, bank_name.trim(), bank_account.trim(), account_name.trim());

    res.status(201).json({
      message: 'คำขอถอนเงินถูกส่งแล้ว รอแอดมินตรวจสอบ',
      withdrawId,
      status: 'pending',
      thbAmount
    });
  } catch (err) {
    console.error('Create withdrawal error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/withdraw/list - Get user's withdrawal history
router.get('/list', authenticate, async (req, res) => {
  try {
    const withdrawals = await prepare(
      'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.userId);
    res.json({ withdrawals });
  } catch (err) {
    console.error('List withdrawals error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/withdraw/:id - Get single withdrawal details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const withdrawal = await prepare('SELECT * FROM withdrawals WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.userId);
    if (!withdrawal) {
      return res.status(404).json({ error: 'ไม่พบรายการ' });
    }
    res.json({ withdrawal });
  } catch (err) {
    console.error('Get withdrawal error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

module.exports = router;
