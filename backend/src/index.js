require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const { initializeDatabase, prepare, saveDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// ============ SECURITY MIDDLEWARE ============

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Disabled for API
}));

// CORS - strict origin control
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      process.env.FRONTEND_URL,
      // Support any Vercel deployment preview URLs
      ...(process.env.FRONTEND_URL ? [
        process.env.FRONTEND_URL.replace(/https?:\/\//, 'https://*-').replace(/[^/]+$/, '*.vercel.app')
      ] : [])
    ].filter(Boolean);
    
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // Allow any Vercel preview deployment
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('ไม่อนุญาตจากต้นทางนี้'));
    }
  },
  credentials: true
}));

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Security: Remove sensitive headers
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
// Apply strict rate limiting to sensitive auth endpoints only
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/send-otp', authLimiter);
// General API rate limit - EXCLUDE auth routes (they have their own stricter limiter)
// and Google OAuth callback/URL (single-use redirects from Google, must not be blocked)
app.use('/api', (req, res, next) => {
  // Skip rate limiting for all auth routes (login/register have their own authLimiter at 5/10s)
  // and Google OAuth (URL + callback are single-use redirects, not attack vectors)
  if (req.path.startsWith('/auth/')) return next();
  strictLimiter(req, res, next);
});

// ============ STATIC FILES ============
// Ensure uploads directory exists
const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!require('fs').existsSync(uploadsDir)) {
  require('fs').mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

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
// CORS error handler
app.use((err, req, res, next) => {
  if (err.message === 'ไม่อนุญาตจากต้นทางนี้') {
    return res.status(403).json({ error: err.message });
  }
  next(err);
});

// General error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'ไม่พบเส้นทางที่ขอ' });
});

// ============ REAL-TIME MARKET ENGINE ============
const marketEngine = require('./market-engine');

// ============ STARTUP ============

// Seed initial price history data so the chart always has data to display
async function seedInitialChartData() {
  try {
    const { prepare, saveDatabase } = require('./database');
    const countRow = await prepare('SELECT COUNT(*) as count FROM price_history').get();
    const count = countRow ? countRow.count : 0;
    
    if (count === 0) {
      const priceSetting = await prepare("SELECT value FROM settings WHERE key = 'nvc_price'").get();
      const basePrice = parseFloat(priceSetting?.value || '0.0004546');
      const now = Math.floor(Date.now() / 1000);
      let totalPoints = 0;
      
      // Seed chart with natural-looking historical data
      // Tiny random walk ±2% so chart has shape, but these are HISTORICAL only
      // Current price is NOT affected — only real trades move the live price
      let histPrice = basePrice;
      const sevenDaysSeconds = 7 * 24 * 3600;
      const step = Math.floor(sevenDaysSeconds / 128);
      
      for (let i = 0; i < 128; i++) {
        // Small random walk: ±1% per step, anchored to basePrice (mean reversion)
        const drift = (basePrice - histPrice) * 0.02; // pull toward base
        const noise = (Math.random() - 0.5) * basePrice * 0.02; // ±1% noise
        histPrice = histPrice + drift + noise;
        // Clamp within ±5% of base
        const minP = basePrice * 0.95;
        const maxP = basePrice * 1.05;
        histPrice = Math.max(minP, Math.min(maxP, histPrice));
        histPrice = Math.round(histPrice * 10000000) / 10000000;
        
        const secondsAgo = sevenDaysSeconds - (i * step);
        const timestamp = new Date((now - secondsAgo) * 1000).toISOString();
        
        await prepare('INSERT INTO price_history (price, volume, timestamp) VALUES (?, ?, ?)')
          .run(histPrice, 0, timestamp);
        totalPoints++;
      }
      // Ensure the last seed point matches basePrice (so chart transitions cleanly to live)
      const latestTs = new Date(now * 1000).toISOString();
      await prepare('INSERT INTO price_history (price, volume, timestamp) VALUES (?, ?, ?)')
        .run(basePrice, 0, latestTs);
      totalPoints++;
      
      saveDatabase();
      console.log(`   📊 Seeded ${totalPoints} initial price history data points for chart`);
    }
  } catch (e) {
    console.error('   ⚠️ Seed chart data error:', e.message);
  }
}

// Initialize database then start server
initializeDatabase().then(async () => {
  await seedInitialChartData();
  // Start real-time market engine for live price ticks
  const { prepare, saveDatabase } = require('./database');
  await marketEngine.init(prepare, null, saveDatabase);
  
  app.listen(PORT, '0.0.0.0', () => {
    const dbMode = require('./database').IS_POSTGRES ? 'PostgreSQL (Neon)' : 'SQLite (sql.js)';
    console.log(`
  ╔══════════════════════════════════════════╗
  ║        NovaCoin Exchange API v1.0        ║
  ║──────────────────────────────────────────║
  ║  Server: http://localhost:${PORT}              ║
  ║  Status: 🟢 Running                      ║
  ║  Security: 🛡️ Active                     ║
  ║  DB: ${dbMode.padEnd(30)}║
  ╚══════════════════════════════════════════╝
    `);
  });
});
