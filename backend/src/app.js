/**
 * NovaCoin Exchange - Express Application
 * 
 * This file creates and configures the Express app without starting the server.
 * It's used by both:
 *   - src/index.js  (local development, starts listening on a port)
 *   - api/index.js  (Vercel serverless, exports the app)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const fs = require('fs');
const { initializeDatabase, prepare, saveDatabase } = require('./database');

const app = express();

// ============ SECURITY MIDDLEWARE ============

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// CORS - strict origin control
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      process.env.FRONTEND_URL,
    ].filter(Boolean);
    
    if (!origin) return callback(null, true);
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('ไม่อนุญาตจากต้นทางนี้'));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Rate limiting
const { rateLimiter } = require('./middleware/rateLimiter');
const authLimiter = rateLimiter({ windowMs: 10000, max: 5, message: 'คำขอมากเกินไป กรุณารอ 10 วินาทีแล้วลองใหม่', logToDb: true });
const strictLimiter = rateLimiter({ windowMs: 10000, max: 20, message: 'คำขอมากเกินไป กรุณารอสักครู่' });

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/send-otp', authLimiter);

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  strictLimiter(req, res, next);
});

// ============ STATIC FILES ============
// On Vercel, /var/task is read-only — use /tmp for uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || 
  (process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '..', 'uploads'));
try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('⚠️ Cannot create uploads directory:', e.message);
}
app.use('/uploads', express.static(UPLOAD_DIR));

// ============ ROUTES ============
const authRoutes = require('./routes/auth');
const googleAuthRoutes = require('./routes/google-auth');
const walletRoutes = require('./routes/wallet');
const depositRoutes = require('./routes/deposit');
const withdrawRoutes = require('./routes/withdraw');
const tradingRoutes = require('./routes/trading');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/withdraw', withdrawRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'NovaCoin Exchange API',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
  if (err.message === 'ไม่อนุญาตจากต้นทางนี้') {
    return res.status(403).json({ error: err.message });
  }
  next(err);
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'ไม่พบเส้นทางที่ขอ' });
});

module.exports = app;
