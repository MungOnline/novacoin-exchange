const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db, prepare, query } = require('../database');

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Scopes that we request from Google
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// GET /api/auth/google/url - Get Google OAuth URL
router.get('/url', (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(400).json({ 
        error: 'ยังไม่ได้ตั้งค่า Google OAuth',
        help: 'กรุณาตั้งค่า GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET ในไฟล์ .env'
      });
    }

    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback';
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    
    res.json({ url });
  } catch (err) {
    console.error('Google URL error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/auth/google/callback - Handle Google OAuth callback
// Note: This endpoint must NOT be behind rate limiting (see index.js exclusion)
router.get('/callback', async (req, res) => {
  try {
    // Clear any lingering rate-limit entries that might have been set before the exclusion was applied
    const { code, error: oauthError } = req.query;

    if (oauthError) {
      console.error('Google OAuth error:', oauthError);
      return res.redirect(`${FRONTEND_URL}/login?error=google_${oauthError}`);
    }

    if (!code) {
      return res.redirect(`${FRONTEND_URL}/login?error=no_code`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback';

    if (!clientId || !clientSecret) {
      return res.redirect(`${FRONTEND_URL}/login?error=google_not_configured`);
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return res.redirect(`${FRONTEND_URL}/login?error=token_exchange_failed`);
    }

    const tokens = await tokenResponse.json();
    const { access_token, id_token } = tokens;

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userInfoResponse.ok) {
      return res.redirect(`${FRONTEND_URL}/login?error=userinfo_failed`);
    }

    const googleUser = await userInfoResponse.json();
    const { id: googleId, email, name, picture, verified_email } = googleUser;

    if (!email) {
      return res.redirect(`${FRONTEND_URL}/login?error=no_email`);
    }

    // Check if user exists by email
    let user = await prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (user) {
      // User exists - update google_id if not set
      if (!user.google_id) {
        await prepare("UPDATE users SET google_id = ?, full_name = COALESCE(NULLIF(?, ''), full_name), updated_at = datetime('now') WHERE id = ?")
          .run(googleId, name || '', user.id);
      }
    } else {
      // Create new user
      const userId = uuidv4();
      const randomPassword = uuidv4() + uuidv4(); // Random password (user will use Google login)
      const hashedPassword = await bcrypt.hash(randomPassword, 12);

      await prepare(`
        INSERT INTO users (id, email, password, full_name, google_id, email_verified)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, email, hashedPassword, name || '', googleId, verified_email ? 1 : 0);

      // Create wallets
      await prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
        .run(uuidv4(), userId, 'THB', 0);
      await prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
        .run(uuidv4(), userId, 'NVC', 0);

      // Update user count
      const count = await prepare('SELECT COUNT(*) as count FROM users').get();
      await prepare("UPDATE settings SET value = ? WHERE key = 'total_users'").run(String(count.count));

      user = await prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    if (user.is_banned) {
      return res.redirect(`${FRONTEND_URL}/login?error=banned`);
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log session
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await prepare('INSERT INTO sessions (id, user_id, token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sessionId, user.id, token, req.ip || '', req.headers['user-agent'] || '', expiresAt);

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || FRONTEND_URL;
    res.redirect(`${frontendUrl}/login?google_token=${token}&email=${encodeURIComponent(email)}`);

  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=server_error`);
  }
});

// POST /api/auth/google/verify - Verify Google token from frontend
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'ไม่พบ Token' });
    }

    // Verify the JWT we generated
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    }

    const user = await prepare('SELECT id, email, full_name, is_admin, is_banned, twofa_enabled, email_verified FROM users WHERE id = ?').get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'ไม่พบผู้ใช้งาน' });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
    }

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
    console.error('Google verify error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

module.exports = router;
