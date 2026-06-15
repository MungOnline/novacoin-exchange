const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { prepare } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Configure multer for slip uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || './uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `slip_${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, !!(ext || mime));
  }
});

// GET /api/deposit/info - Get deposit bank info
router.get('/info', async (req, res) => {
  try {
    // Get all deposit-related settings at once
    const settingsRows = await prepare(`
      SELECT key, value FROM settings 
      WHERE key IN ('deposit_bank_name', 'deposit_account_number', 'deposit_account_name', 'deposit_qr_code')
    `).all();

    const settings = {};
    settingsRows.forEach(s => { settings[s.key] = s.value; });

    res.json({
      bank: {
        name: settings.deposit_bank_name || 'ธนาคารกรุงเทพ',
        accountNumber: settings.deposit_account_number || '123-4-56789-0',
        accountName: settings.deposit_account_name || 'บริษัท โนวา คอยน์ จำกัด'
      },
      qrCode: settings.deposit_qr_code || null
    });
  } catch (err) {
    console.error('Get deposit info error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/deposit/create - Create a deposit request
router.post('/create', authenticate, upload.single('slip'), async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'กรุณาระบุจำนวนเงินที่ถูกต้อง' });
    }
    if (parseFloat(amount) < 100) {
      return res.status(400).json({ error: 'จำนวนเงินขั้นต่ำ 100 บาท' });
    }

    const depositId = uuidv4();
    const slipFilename = req.file ? req.file.filename : null;

    await prepare('INSERT INTO deposits (id, user_id, amount, slip_filename, status) VALUES (?, ?, ?, ?, ?)')
      .run(depositId, req.userId, parseFloat(amount), slipFilename, 'pending');

    res.status(201).json({
      message: 'คำขอเติมเงินถูกส่งแล้ว รอแอดมินตรวจสอบ',
      depositId,
      status: 'pending'
    });
  } catch (err) {
    console.error('Create deposit error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/deposit/list - Get user's deposits
router.get('/list', authenticate, async (req, res) => {
  try {
    const deposits = await prepare(
      'SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.userId);
    res.json({ deposits });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/deposit/:id - Get single deposit details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const deposit = await prepare('SELECT * FROM deposits WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.userId);
    if (!deposit) {
      return res.status(404).json({ error: 'ไม่พบรายการ' });
    }
    res.json({ deposit });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

module.exports = router;
