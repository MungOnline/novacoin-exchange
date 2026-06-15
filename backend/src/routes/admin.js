const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { prepare } = require('../database');
const { authenticate, requireAdmin, requireAdminPin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { adminActionLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// ============ ADMIN PIN VERIFICATION ============
// POST /api/admin/verify-pin - Admin verifies PIN for sensitive actions
router.post('/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    
    if (!pin) {
      return res.status(400).json({ error: 'กรุณากรอกรหัส PIN' });
    }

    // Get stored PIN
    const storedPinSetting = await prepare("SELECT value FROM settings WHERE key = 'admin_pin'").get();
    const storedPin = storedPinSetting?.value 
      || process.env.ADMIN_PIN 
      || '141200';

    const userPin = String(pin).trim();
    const expectedPin = String(storedPin).trim();

    if (userPin !== expectedPin) {
      await logAudit(req.userId, 'admin_pin_failed', 'admin', req.userId, {}, req);
      return res.status(401).json({ error: 'รหัส PIN ไม่ถูกต้อง' });
    }

    await logAudit(req.userId, 'admin_pin_verify', 'admin', req.userId, { success: true }, req);

    res.json({ 
      verified: true,
      message: 'ยืนยัน PIN สำเร็จ'
    });
  } catch (err) {
    console.error('Admin PIN verify error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// ============ WALLET ADJUSTMENT (ADMIN FILL) ============
// POST /api/admin/wallet/adjust - Admin adds/removes funds from user wallet
router.post('/wallet/adjust', adminActionLimiter, requireAdminPin, async (req, res) => {
  try {
    const { userId: targetUserId, currency, amount, reason } = req.body;

    // === VALIDATION ===
    if (!targetUserId) {
      return res.status(400).json({ error: 'กรุณาระบุผู้ใช้' });
    }
    if (!currency || !['THB', 'NVC'].includes(currency)) {
      return res.status(400).json({ error: 'สกุลเงินไม่ถูกต้อง (THB หรือ NVC เท่านั้น)' });
    }
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'กรุณาระบุจำนวนเงินที่ถูกต้อง (มากกว่า 0)' });
    }
    if (parseFloat(amount) > 10000000) {
      return res.status(400).json({ error: 'จำนวนเงินสูงสุดต่อครั้งคือ 10,000,000' });
    }
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'กรุณาระบุเหตุผล (อย่างน้อย 5 ตัวอักษร)' });
    }
    if (reason.length > 500) {
      return res.status(400).json({ error: 'เหตุผลยาวเกินไป (สูงสุด 500 ตัวอักษร)' });
    }

    // Check that admin is not adjusting their own wallet
    if (targetUserId === req.userId) {
      return res.status(403).json({ error: 'ไม่สามารถปรับยอดเงินของตัวเองได้' });
    }

    // Check target user exists
    const targetUser = await prepare('SELECT id, email, full_name, is_admin FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    }

    // Cannot adjust admin wallets
    if (targetUser.is_admin) {
      return res.status(403).json({ error: 'ไม่สามารถปรับยอดเงินของผู้ดูแลระบบคนอื่นได้' });
    }

    const amountNum = parseFloat(amount);

    // Check wallet exists, create if not
    let wallet = await prepare('SELECT * FROM wallets WHERE user_id = ? AND currency = ?')
      .get(targetUserId, currency);
    
    if (!wallet) {
      const walletId = uuidv4();
      await prepare('INSERT INTO wallets (id, user_id, currency, balance, locked) VALUES (?, ?, ?, 0, 0)')
        .run(walletId, targetUserId, currency);
      wallet = await prepare('SELECT * FROM wallets WHERE id = ?').get(walletId);
    }

    // Update balance
    const newBalance = wallet.balance + amountNum;
    if (newBalance < 0) {
      return res.status(400).json({ error: 'ยอดเงินไม่เพียงพอที่จะหัก' });
    }

    await prepare('UPDATE wallets SET balance = ?, updated_at = datetime("now") WHERE id = ?')
      .run(newBalance, wallet.id);

    // Log to audit trail
    await logAudit(req.userId, 'wallet_adjust', 'user', targetUserId, {
      currency,
      amount: amountNum,
      balanceBefore: wallet.balance,
      balanceAfter: newBalance,
      reason: reason.trim()
    }, req);

    res.json({
      message: `ปรับยอดเงิน ${currency} ของ ${targetUser.email} สำเร็จ`,
      userId: targetUserId,
      currency,
      amount: amountNum,
      balanceBefore: wallet.balance,
      balanceAfter: newBalance
    });
  } catch (err) {
    console.error('Wallet adjust error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/admin/wallet/audit/:userId - Get audit logs for a user
router.get('/wallet/audit/:userId', async (req, res) => {
  try {
    const logs = await prepare(`
      SELECT al.*, u.email as admin_email, u.full_name as admin_name
      FROM audit_logs al
      JOIN users u ON u.id = al.admin_id
      WHERE al.target_id = ? AND al.action = 'wallet_adjust'
      ORDER BY al.created_at DESC
      LIMIT 100
    `).all(req.params.userId);

    // Parse JSON details
    const parsedLogs = logs.map(log => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : {}
    }));

    res.json({ logs: parsedLogs });
  } catch (err) {
    console.error('Get audit logs error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// ============ USER MANAGEMENT ============

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const users = await prepare(`
      SELECT u.id, u.email, u.full_name, u.phone, u.is_admin, u.is_banned, 
             u.twofa_enabled, u.email_verified, u.created_at, u.last_login_ip, u.last_login_at,
             COALESCE(w_thb.balance, 0) as thb_balance, 
             COALESCE(w_thb.locked, 0) as thb_locked,
             COALESCE(w_nvc.balance, 0) as nvc_balance,
             COALESCE(w_nvc.locked, 0) as nvc_locked
      FROM users u
      LEFT JOIN wallets w_thb ON w_thb.user_id = u.id AND w_thb.currency = 'THB'
      LEFT JOIN wallets w_nvc ON w_nvc.user_id = u.id AND w_nvc.currency = 'NVC'
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = await prepare('SELECT COUNT(*) as count FROM users').get();

    res.json({
      users,
      pagination: { page, limit, total: total.count, totalPages: Math.ceil(total.count / limit) }
    });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/admin/deposits
router.get('/deposits', async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let query = `
      SELECT d.*, u.email, u.full_name
      FROM deposits d
      JOIN users u ON u.id = d.user_id
    `;
    let params = [];

    if (status !== 'all') {
      query += ' WHERE d.status = ?';
      params.push(status);
    }
    query += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const deposits = await prepare(query).all(...params);

    let countQuery = 'SELECT COUNT(*) as count FROM deposits d';
    let countParams = [];
    if (status !== 'all') {
      countQuery += ' WHERE d.status = ?';
      countParams.push(status);
    }
    const total = await prepare(countQuery).get(...countParams);

    res.json({
      deposits,
      pagination: { page, limit, total: total.count, totalPages: Math.ceil(total.count / limit) }
    });
  } catch (err) {
    console.error('Admin list deposits error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/admin/deposits/:id/approve
router.post('/deposits/:id/approve', adminActionLimiter, async (req, res) => {
  try {
    const deposit = await prepare('SELECT * FROM deposits WHERE id = ?').get(req.params.id);
    if (!deposit) return res.status(404).json({ error: 'ไม่พบรายการ' });
    if (deposit.status !== 'pending') return res.status(400).json({ error: 'รายการนี้ถูกดำเนินการแล้ว' });

    await prepare("UPDATE deposits SET status = 'approved', admin_id = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.userId, (req.body.notes || '').substring(0, 500), req.params.id);

    // Add THB to user wallet
    const thbWallet = await prepare("SELECT * FROM wallets WHERE user_id = ? AND currency = 'THB'").get(deposit.user_id);
    if (thbWallet) {
      await prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?').run(deposit.amount, thbWallet.id);
    } else {
      const walletId = uuidv4();
      await prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
        .run(walletId, deposit.user_id, 'THB', deposit.amount);
    }

    // Audit log
    await logAudit(req.userId, 'deposit_approve', 'deposit', req.params.id, {
      userId: deposit.user_id,
      amount: deposit.amount,
      notes: req.body.notes || ''
    }, req);

    res.json({ message: 'อนุมัติการเติมเงินสำเร็จ', depositId: req.params.id });
  } catch (err) {
    console.error('Approve deposit error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/admin/deposits/:id/reject
router.post('/deposits/:id/reject', adminActionLimiter, async (req, res) => {
  try {
    const deposit = await prepare('SELECT * FROM deposits WHERE id = ?').get(req.params.id);
    if (!deposit) return res.status(404).json({ error: 'ไม่พบรายการ' });
    if (deposit.status !== 'pending') return res.status(400).json({ error: 'รายการนี้ถูกดำเนินการแล้ว' });

    await prepare("UPDATE deposits SET status = 'rejected', admin_id = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.userId, (req.body.notes || '').substring(0, 500), req.params.id);

    // Audit log
    await logAudit(req.userId, 'deposit_reject', 'deposit', req.params.id, {
      userId: deposit.user_id,
      amount: deposit.amount,
      notes: req.body.notes || ''
    }, req);

    res.json({ message: 'ปฏิเสธการเติมเงินแล้ว', depositId: req.params.id });
  } catch (err) {
    console.error('Reject deposit error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// ============ WITHDRAWAL MANAGEMENT ============

// GET /api/admin/withdrawals - List withdrawals with optional status filter
router.get('/withdrawals', async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let query = `
      SELECT w.*, u.email, u.full_name
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
    `;
    let params = [];

    if (status !== 'all') {
      query += ' WHERE w.status = ?';
      params.push(status);
    }
    query += ' ORDER BY w.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const withdrawals = await prepare(query).all(...params);

    let countQuery = 'SELECT COUNT(*) as count FROM withdrawals w';
    let countParams = [];
    if (status !== 'all') {
      countQuery += ' WHERE w.status = ?';
      countParams.push(status);
    }
    const total = await prepare(countQuery).get(...countParams);

    res.json({
      withdrawals,
      pagination: { page, limit, total: total.count, totalPages: Math.ceil(total.count / limit) }
    });
  } catch (err) {
    console.error('Admin list withdrawals error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/admin/withdrawals/:id/approve
router.post('/withdrawals/:id/approve', adminActionLimiter, async (req, res) => {
  try {
    const withdrawal = await prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: 'ไม่พบรายการ' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'รายการนี้ถูกดำเนินการแล้ว' });

    // Update withdrawal status to approved
    await prepare("UPDATE withdrawals SET status = 'approved', admin_id = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.userId, (req.body.notes || '').substring(0, 500), req.params.id);

    // NVC is already locked/deducted from balance on request; remove from locked
    const nvcWallet = await prepare("SELECT * FROM wallets WHERE user_id = ? AND currency = 'NVC'").get(withdrawal.user_id);
    if (nvcWallet) {
      await prepare('UPDATE wallets SET locked = locked - ?, updated_at = datetime("now") WHERE id = ?')
        .run(withdrawal.amount, nvcWallet.id);
    }

    // Add THB to user wallet
    const thbWallet = await prepare("SELECT * FROM wallets WHERE user_id = ? AND currency = 'THB'").get(withdrawal.user_id);
    if (thbWallet) {
      await prepare('UPDATE wallets SET balance = balance + ?, updated_at = datetime("now") WHERE id = ?')
        .run(withdrawal.thb_amount, thbWallet.id);
    } else {
      const walletId = uuidv4();
      await prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
        .run(walletId, withdrawal.user_id, 'THB', withdrawal.thb_amount);
    }

    // Audit log
    await logAudit(req.userId, 'withdrawal_approve', 'withdrawal', req.params.id, {
      userId: withdrawal.user_id,
      amount: withdrawal.amount,
      thbAmount: withdrawal.thb_amount,
      notes: req.body.notes || ''
    }, req);

    res.json({ message: 'อนุมัติการถอนเงินสำเร็จ', withdrawId: req.params.id });
  } catch (err) {
    console.error('Approve withdrawal error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/admin/withdrawals/:id/reject
router.post('/withdrawals/:id/reject', adminActionLimiter, async (req, res) => {
  try {
    const withdrawal = await prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: 'ไม่พบรายการ' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'รายการนี้ถูกดำเนินการแล้ว' });

    // Update withdrawal status to rejected
    await prepare("UPDATE withdrawals SET status = 'rejected', admin_id = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.userId, (req.body.notes || '').substring(0, 500), req.params.id);

    // Return NVC to user (remove from locked, add back to balance)
    const nvcWallet = await prepare("SELECT * FROM wallets WHERE user_id = ? AND currency = 'NVC'").get(withdrawal.user_id);
    if (nvcWallet) {
      await prepare('UPDATE wallets SET balance = balance + ?, locked = locked - ?, updated_at = datetime("now") WHERE id = ?')
        .run(withdrawal.amount, withdrawal.amount, nvcWallet.id);
    }

    // Audit log
    await logAudit(req.userId, 'withdrawal_reject', 'withdrawal', req.params.id, {
      userId: withdrawal.user_id,
      amount: withdrawal.amount,
      notes: req.body.notes || ''
    }, req);

    res.json({ message: 'ปฏิเสธการถอนเงินแล้ว', withdrawId: req.params.id });
  } catch (err) {
    console.error('Reject withdrawal error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/admin/users/:id/ban
router.post('/users/:id/ban', adminActionLimiter, async (req, res) => {
  try {
    const user = await prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (user.is_admin) return res.status(403).json({ error: 'ไม่สามารถแบนผู้ดูแลระบบได้' });
    if (user.id === req.userId) return res.status(403).json({ error: 'ไม่สามารถแบนตัวเองได้' });

    const newStatus = user.is_banned ? 0 : 1;
    await prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(newStatus, req.params.id);

    // Audit log
    await logAudit(req.userId, newStatus ? 'user_ban' : 'user_unban', 'user', req.params.id, {
      action: newStatus ? 'ban' : 'unban',
      userEmail: user.email
    }, req);

    // If banning, invalidate all sessions
    if (newStatus) {
      await prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
    }

    res.json({
      message: newStatus ? 'แบนผู้ใช้แล้ว' : 'ปลดแบนผู้ใช้แล้ว',
      is_banned: newStatus
    });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/admin/orders
router.get('/orders', async (req, res) => {
  try {
    const orders = await prepare(`
      SELECT o.*, u.email, u.full_name
      FROM orders o
      JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC LIMIT 50
    `).all();
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/admin/trades
router.get('/trades', async (req, res) => {
  try {
    const trades = await prepare(`
      SELECT t.*, buyer.email as buyer_email, seller.email as seller_email
      FROM trades t
      JOIN users buyer ON buyer.id = t.buyer_id
      JOIN users seller ON seller.id = t.seller_id
      ORDER BY t.created_at DESC LIMIT 50
    `).all();
    res.json({ trades });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// ============ SETTINGS MANAGEMENT ============

// POST /api/admin/settings - Update settings
router.post('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) return res.status(400).json({ error: 'กรุณาระบุ key และ value' });

    // Whitelist allowed setting keys - prevent overwriting critical settings
    const allowedKeys = [
      'nvc_price',
      'nvc_price_change_24h',
      'market_cap',
      'volume_24h',
      'deposit_bank_name',
      'deposit_account_number',
      'deposit_account_name',
      'deposit_qr_code'
    ];

    if (!allowedKeys.includes(key)) {
      return res.status(403).json({ error: 'ไม่สามารถแก้ไขค่าตั้งต้นี้ได้' });
    }

    // Validate values based on key
    if (key === 'nvc_price' || key === 'market_cap' || key === 'volume_24h') {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) {
        return res.status(400).json({ error: 'ค่าต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0' });
      }
    }

    await prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))")
      .run(key, String(value));

    // Audit log
    await logAudit(req.userId, 'settings_update', 'settings', key, { key, value }, req);

    res.json({ message: 'อัปเดตตั้งค่าแล้ว', key, value });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/admin/settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await prepare('SELECT * FROM settings').all();
    const settingsObj = {};
    settings.forEach(s => { settingsObj[s.key] = s.value; });
    res.json({ settings: settingsObj });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const totalUsers = await prepare('SELECT COUNT(*) as count FROM users').get();
    const totalDeposits = await prepare('SELECT COUNT(*) as count FROM deposits').get();
    const pendingDeposits = await prepare("SELECT COUNT(*) as count FROM deposits WHERE status = 'pending'").get();
    const totalOrders = await prepare('SELECT COUNT(*) as count FROM orders').get();
    const totalTrades = await prepare('SELECT COUNT(*) as count FROM trades').get();
    const totalTradeVolume = await prepare('SELECT COALESCE(SUM(total), 0) as total FROM trades').get();
    const totalThbBalance = await prepare("SELECT COALESCE(SUM(balance), 0) as total FROM wallets WHERE currency = 'THB'").get();
    const totalNvcBalance = await prepare("SELECT COALESCE(SUM(balance), 0) as total FROM wallets WHERE currency = 'NVC'").get();

    // Withdrawal stats
    const totalWithdrawals = await prepare('SELECT COUNT(*) as count FROM withdrawals').get();
    const pendingWithdrawals = await prepare("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'").get();
    const todayWithdrawals = await prepare(`
      SELECT COALESCE(SUM(thb_amount), 0) as total FROM withdrawals 
      WHERE status = 'approved' AND date(created_at) = date('now')
    `).get();

    const recentPendingDeposits = await prepare(`
      SELECT d.*, u.email, u.full_name
      FROM deposits d
      JOIN users u ON u.id = d.user_id
      WHERE d.status = 'pending'
      ORDER BY d.created_at DESC LIMIT 10
    `).all();

    const recentPendingWithdrawals = await prepare(`
      SELECT w.*, u.email, u.full_name
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
      WHERE w.status = 'pending'
      ORDER BY w.created_at DESC LIMIT 10
    `).all();

    const todayDeposits = await prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM deposits 
      WHERE status = 'approved' AND date(created_at) = date('now')
    `).get();

    const todayWithdrawalsRow = todayWithdrawals;

    // Admin audit log count
    const recentActions = await prepare(`
      SELECT COUNT(*) as count FROM audit_logs WHERE admin_id = ? AND created_at > datetime('now', '-24 hours')
    `).get(req.userId);

    res.json({
      stats: {
        totalUsers: totalUsers.count,
        totalDeposits: totalDeposits.count,
        pendingDeposits: pendingDeposits.count,
        totalOrders: totalOrders.count,
        totalTrades: totalTrades.count,
        totalTradeVolume: totalTradeVolume.total,
        totalThbBalance: totalThbBalance.total,
        totalNvcBalance: totalNvcBalance.total,
        todayDeposits: todayDeposits.total,
        totalWithdrawals: totalWithdrawals.count,
        pendingWithdrawals: pendingWithdrawals.count,
        todayWithdrawals: todayWithdrawalsRow.total,
        adminActions24h: recentActions.count
      },
      recentPendingDeposits,
      recentPendingWithdrawals
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// ============ QR CODE UPLOAD ============
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const qrStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename - remove special chars, randomize
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `qr_deposit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);
  }
});

const uploadQr = multer({
  storage: qrStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    // Validate MIME type (more secure than extension)
    const allowedMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) return cb(null, true);
    cb(new Error('เฉพาะไฟล์รูปภาพ (PNG, JPG, GIF, WEBP) เท่านั้น'));
  }
});

router.post('/deposit/qrcode', uploadQr.single('qrcode'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์รูปภาพ' });

    const qrPath = `/uploads/${req.file.filename}`;
    await prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('deposit_qr_code', ?, datetime('now'))")
      .run(qrPath);

    await logAudit(req.userId, 'qrcode_upload', 'settings', 'deposit_qr_code', { path: qrPath }, req);

    res.json({ message: 'อัปโหลด QR Code สำเร็จ', path: qrPath });
  } catch (err) {
    console.error('Upload QR code error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

router.delete('/deposit/qrcode', async (req, res) => {
  try {
    const current = await prepare("SELECT value FROM settings WHERE key = 'deposit_qr_code'").get();
    if (current && current.value) {
      const filePath = path.join(__dirname, '..', '..', current.value);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('deposit_qr_code', '', datetime('now'))")
      .run();

    await logAudit(req.userId, 'qrcode_delete', 'settings', 'deposit_qr_code', {}, req);

    res.json({ message: 'ลบ QR Code แล้ว' });
  } catch (err) {
    console.error('Delete QR code error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

module.exports = router;
