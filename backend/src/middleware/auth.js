const jwt = require('jsonwebtoken');
const { prepare } = require('../database');

/**
 * Authenticate user via JWT Bearer token
 * Also validates session is still active
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'ไม่พบ Token การยืนยันตัวตน' });
  }

  const token = authHeader.split(' ')[1];
  
  // Validate token length to prevent abuse
  if (!token || token.length < 10 || token.length > 5000) {
    return res.status(401).json({ error: 'Token ไม่ถูกต้อง' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user
    const user = await prepare(
      'SELECT id, email, full_name, is_admin, is_banned, twofa_enabled, email_verified, twofa_secret FROM users WHERE id = ?'
    ).get(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'ไม่พบผู้ใช้งาน' });
    }
    
    // Check ban status on every request
    if (user.is_banned) {
      return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
    }

    // Validate session still exists and is not expired
    const session = await prepare(
      'SELECT id FROM sessions WHERE token = ? AND expires_at > datetime("now")'
    ).get(token);
    
    if (!session) {
      return res.status(401).json({ error: 'เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' });
    }

    req.user = user;
    req.userId = user.id;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' });
    }
    return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  }
  next();
}

/**
 * Require admin PIN verification for sensitive actions
 * Admin must enter the correct PIN before performing sensitive operations
 */
async function requireAdminPin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  }

  // Check X-Admin-Pin header
  const adminPin = req.headers['x-admin-pin'];
  if (!adminPin) {
    return res.status(403).json({ 
      error: 'กรุณายืนยันรหัส PIN', 
      requiresPin: true 
    });
  }

  // Get stored PIN (from settings with fallback to env or default)
  const storedPinSetting = await prepare("SELECT value FROM settings WHERE key = 'admin_pin'").get();
  const storedPin = storedPinSetting?.value 
    || process.env.ADMIN_PIN 
    || '141200';

  // Constant-time comparison to prevent timing attack
  const userPin = String(adminPin).trim();
  const expectedPin = String(storedPin).trim();

  if (userPin.length !== expectedPin.length || userPin !== expectedPin) {
    return res.status(403).json({ error: 'รหัส PIN ไม่ถูกต้อง' });
  }

  // PIN is valid - set a flag on request for audit logging
  req.adminPinVerified = true;
  next();
}

module.exports = { authenticate, requireAdmin, requireAdminPin };
