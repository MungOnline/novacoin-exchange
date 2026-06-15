const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { db, prepare, query } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// Email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Password strength validation
function isValidPassword(password) {
  if (password.length < 8) return false;
  if (password.length > 128) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

// Sanitize string - remove dangerous characters
function sanitize(str) {
  if (!str) return '';
  return String(str).replace(/[<>&"']/g, '').trim();
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, phone } = req.body;

    // Validate email
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลที่ถูกต้อง' });
    }

    // Validate password strength
    if (!password) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสผ่าน' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'รหัสผ่านยาวเกินไป' });
    }

    // Check existing user
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    const sanitizedName = sanitize(full_name);
    const sanitizedPhone = sanitize(phone);

    await prepare('INSERT INTO users (id, email, password, full_name, phone) VALUES (?, ?, ?, ?, ?)')
      .run(userId, normalizedEmail, hashedPassword, sanitizedName || '', sanitizedPhone || '');

    // Create wallets
    await prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), userId, 'THB', 0);
    await prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), userId, 'NVC', 0);

    // Update total users count
    const count = await prepare('SELECT COUNT(*) as count FROM users').get();
    await prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(count.count), 'total_users');

    // Generate OTP (not returned to client in production)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await prepare('INSERT INTO otp_codes (email, code, type, expires_at) VALUES (?, ?, ?, ?)')
      .run(normalizedEmail, code, 'verify_email', expires);

    console.log(`[DEV] OTP for ${normalizedEmail}: ${code}`);

    res.status(201).json({
      message: 'สมัครสมาชิกสำเร็จ กรุณายืนยันอีเมล',
      userId,
      email: normalizedEmail
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    const otp = await prepare(
      'SELECT * FROM otp_codes WHERE email = ? AND code = ? AND type = ? AND used = 0 AND expires_at > datetime("now")'
    ).get(email, code, 'verify_email');

    if (!otp) {
      return res.status(400).json({ error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
    }

    await prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(otp.id);
    await prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email);
    res.json({ message: 'ยืนยันอีเมลสำเร็จ' });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

    // Use constant-time comparison to prevent timing attacks
    if (!user) {
      // Still do bcrypt compare to prevent user enumeration via timing
      bcrypt.compareSync('dummy_password_for_timing', '$2a$12$LJ3m4ys3Lk0TSwHnbfOMe.Xjy8MfyATlMqF3F3YN3x5G5j5K5Z5K5');
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
    
    if (user.is_banned) {
      return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    
    // Log login attempt
    try {
      await prepare(
        'INSERT INTO login_attempts (ip_address, email, attempt_type, success) VALUES (?, ?, ?, ?)'
      ).run(req.ip || '', normalizedEmail, 'login', validPassword ? 1 : 0);
    } catch (e) { /* ignore */ }

    if (!validPassword) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    // Update last login info
    await prepare('UPDATE users SET last_login_ip = ?, last_login_at = datetime("now") WHERE id = ?')
      .run(req.ip || '', user.id);

    // If 2FA enabled
    if (user.twofa_enabled) {
      const tempToken = jwt.sign(
        { userId: user.id, step: '2fa' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        requiresTwoFactor: true,
        tempToken,
        message: 'กรุณายืนยันรหัส 2FA'
      });
    }

    // Generate JWT (with more claims for tracking)
    const token = jwt.sign(
      { 
        userId: user.id,
        iat: Math.floor(Date.now() / 1000),
        jti: uuidv4()
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log session
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await prepare('INSERT INTO sessions (id, user_id, token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sessionId, user.id, token, req.ip || '', req.headers['user-agent'] || '', expiresAt);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        is_admin: !!user.is_admin,
        twofa_enabled: !!user.twofa_enabled,
        email_verified: !!user.email_verified
      }
    });
  } catch (err) {
    console.error('Login error:', err.message, err.stack);
    try {
      res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ', detail: err.message });
    } catch (e2) {
      console.error('Error sending response:', e2.message);
    }
  }
});

// POST /api/auth/verify-2fa
router.post('/verify-2fa', async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    }
    if (decoded.step !== '2fa') {
      return res.status(401).json({ error: 'Token ไม่ถูกต้อง' });
    }

    const user = await prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    if (!user || !user.twofa_secret) {
      return res.status(400).json({ error: 'ไม่ได้ตั้งค่า 2FA' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twofa_secret,
      encoding: 'base32',
      token: code
    });

    if (!verified) {
      return res.status(401).json({ error: 'รหัส 2FA ไม่ถูกต้อง' });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await prepare('INSERT INTO sessions (id, user_id, token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sessionId, user.id, token, req.ip || '', req.headers['user-agent'] || '', expiresAt);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        is_admin: !!user.is_admin,
        twofa_enabled: !!user.twofa_enabled,
        email_verified: !!user.email_verified
      }
    });
  } catch (err) {
    console.error('2FA verify error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/auth/setup-2fa
router.post('/setup-2fa', authenticate, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: `NovaCoin (${req.user.email})` });
    await prepare('UPDATE users SET twofa_secret = ? WHERE id = ?').run(secret.base32, req.userId);

    qrcode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
      if (err) return res.status(500).json({ error: 'ไม่สามารถสร้าง QR Code ได้' });
      res.json({
        secret: secret.base32,
        qrCode: dataUrl,
        message: 'สแกน QR Code ด้วย Google Authenticator หรือ Microsoft Authenticator'
      });
    });
  } catch (err) {
    console.error('Setup 2FA error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/auth/enable-2fa
router.post('/enable-2fa', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    const user = await prepare('SELECT twofa_secret FROM users WHERE id = ?').get(req.userId);
    if (!user.twofa_secret) {
      return res.status(400).json({ error: 'กรุณาตั้งค่า 2FA ก่อน' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twofa_secret,
      encoding: 'base32',
      token: code
    });

    if (!verified) {
      return res.status(401).json({ error: 'รหัส 2FA ไม่ถูกต้อง' });
    }

    await prepare('UPDATE users SET twofa_enabled = 1 WHERE id = ?').run(req.userId);
    res.json({ message: 'เปิดใช้งาน 2FA สำเร็จ' });
  } catch (err) {
    console.error('Enable 2FA error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/auth/disable-2fa
router.post('/disable-2fa', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    const user = await prepare('SELECT twofa_secret FROM users WHERE id = ?').get(req.userId);
    if (!user.twofa_secret) {
      return res.status(400).json({ error: 'ไม่ได้ตั้งค่า 2FA' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twofa_secret,
      encoding: 'base32',
      token: code
    });

    if (!verified) {
      return res.status(401).json({ error: 'รหัส 2FA ไม่ถูกต้อง' });
    }

    await prepare('UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?').run(req.userId);
    res.json({ message: 'ปิดใช้งาน 2FA สำเร็จ' });
  } catch (err) {
    console.error('Disable 2FA error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { email, type } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมล' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await prepare('INSERT INTO otp_codes (email, code, type, expires_at) VALUES (?, ?, ?, ?)')
      .run(normalizedEmail, code, type || 'verify_email', expires);

    console.log(`[DEV] OTP for ${normalizedEmail}: ${code}`);

    // NEVER return OTP in response
    res.json({ message: 'ส่งรหัสยืนยันไปยังอีเมลแล้ว (ในโหมดพัฒนา: ดูใน Console)' });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader.split(' ')[1];
  await prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ message: 'ออกจากระบบสำเร็จ' });
});

module.exports = router;
