'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';

// Custom hook to safely parse URL search params without requiring Suspense
function useUrlParams() {
  const [params, setParams] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams();
  });

  // Keep a ref to current params string so setInterval closure always has latest value
  const paramsStrRef = useRef(params.toString());

  useEffect(() => {
    paramsStrRef.current = params.toString();
  }, [params]);

  useEffect(() => {
    const handleLocationChange = () => {
      const newParams = new URLSearchParams(window.location.search);
      setParams(newParams);
      paramsStrRef.current = newParams.toString();
    };
    window.addEventListener('popstate', handleLocationChange);
    // Also catch router.replace changes via a simple interval check
    const interval = setInterval(() => {
      const currentStr = window.location.search;
      if (currentStr !== paramsStrRef.current) {
        paramsStrRef.current = currentStr;
        setParams(new URLSearchParams(currentStr));
      }
    }, 500); // check every 500ms instead of 300
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      clearInterval(interval);
    };
  }, []);

  return params;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useUrlParams();
  const { login, verify2fa, processGoogleToken, isAuthenticated } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleConfigured, setGoogleConfigured] = useState(true);
  const [googleConfigChecked, setGoogleConfigChecked] = useState(false);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFACode, setTwoFACode] = useState('');

  const googleCallbackProcessed = useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
      return;
    }

    // Check if Google OAuth is configured
    checkGoogleConfig();

    // Handle Google callback — only process ONCE
    const googleToken = searchParams.get('google_token');
    const googleEmail = searchParams.get('email');
    const errorParam = searchParams.get('error');
    const verified = searchParams.get('verified');

    if (errorParam && !googleCallbackProcessed.current) {
      googleCallbackProcessed.current = true;
      if (errorParam === 'google_not_configured') {
        setError('Google Login ยังไม่ได้ตั้งค่า กรุณาแจ้งผู้ดูแลระบบ');
      } else if (errorParam === 'banned') {
        setError('บัญชีนี้ถูกระงับการใช้งาน');
      } else if (errorParam === 'token_exchange_failed') {
        setError('การยืนยันตัวตนกับ Google ล้มเหลว กรุณาลองอีกครั้ง');
      } else if (errorParam === 'no_email') {
        setError('ไม่ได้รับอีเมลจาก Google');
      } else {
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google');
      }
      // Clean the URL
      window.history.replaceState({}, '', '/login');
      return;
    }

    if (googleToken && !googleCallbackProcessed.current) {
      googleCallbackProcessed.current = true;
      handleGoogleToken(googleToken, googleEmail);
    }
  }, [isAuthenticated, router, searchParams]);

  async function checkGoogleConfig() {
    try {
      const data = await api.getGoogleAuthUrl();
      setGoogleConfigured(!!data.url);
    } catch (err) {
      // Don't disable on transient errors
    } finally {
      setGoogleConfigChecked(true);
    }
  }

  async function handleGoogleToken(token, email) {
    setGoogleLoading(true);
    try {
      const data = await api.verifyGoogleToken(token);
      if (data.token && data.user) {
        await processGoogleToken(data.token, data.user);
        // Clean URL before navigating
        window.history.replaceState({}, '', '/login');
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการยืนยันตัวตน');
      window.history.replaceState({}, '', '/login');
    } finally {
      setGoogleLoading(false);
    }
  }

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const data = await api.getGoogleAuthUrl();
      if (data.url) {
        // Reset the callback guard so a fresh redirect works
        googleCallbackProcessed.current = false;
        window.location.href = data.url;
      } else {
        setError('Google Login ยังไม่ได้ตั้งค่า');
        setGoogleConfigured(false);
        setGoogleLoading(false);
      }
    } catch (err) {
      setError('ไม่สามารถเชื่อมต่อ Google Login ได้ กรุณาลองอีกครั้ง');
      setGoogleLoading(false);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(form.email, form.password);
      if (result.requiresTwoFactor) {
        setRequires2FA(true);
        setTempToken(result.tempToken);
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verify2fa(tempToken, twoFACode);
      router.push('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2FA View
  if (requires2FA) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">ยืนยัน 2FA</h2>
            <p className="text-slate-500 mt-2">กรุณากรอกรหัสจาก Google Authenticator</p>
          </div>

          <form onSubmit={handle2FA} className="space-y-4">
            <input
              type="text"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value)}
              placeholder="รหัส 6 หลัก"
              maxLength={6}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-center text-2xl tracking-widest"
              required
            />
            {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
            <button
              type="submit"
              disabled={loading || twoFACode.length !== 6}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3 rounded-lg font-medium hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 transition-all"
            >
              {loading ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main Login View (always renders immediately)
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Success Messages */}
        {searchParams.get('verified') === 'true' && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm mb-4 text-center">
            ยืนยันอีเมลสำเร็จ! กรุณาเข้าสู่ระบบ
          </div>
        )}

        {googleLoading && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm mb-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
              <span>กำลังตรวจสอบข้อมูลจาก Google...</span>
            </div>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">
            <svg className="w-8 h-8" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="loginCoinGrad" cx="36%" cy="30%" r="65%">
                  <stop offset="0%" stop-color="#a7f3d0"/>
                  <stop offset="25%" stop-color="#34d399"/>
                  <stop offset="60%" stop-color="#059669"/>
                  <stop offset="100%" stop-color="#064e3b"/>
                </radialGradient>
                <linearGradient id="loginRimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#6ee7b7"/>
                  <stop offset="50%" stop-color="#10b981"/>
                  <stop offset="100%" stop-color="#047857"/>
                </linearGradient>
              </defs>
              <circle cx="64" cy="64" r="62" fill="url(#loginRimGrad)"/>
              <circle cx="64" cy="64" r="56" fill="url(#loginCoinGrad)"/>
              <circle cx="64" cy="64" r="48" fill="none" stroke="#34d399" stroke-width="1" opacity="0.3"/>
              <path d="M44 46 L44 82 L50 82 L50 62 L66 82 L84 82 L84 46 L78 46 L78 66 L62 46 Z" fill="#ffffff" opacity="0.95"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">เข้าสู่ระบบ</h1>
          <p className="text-slate-500 mt-2">ยินดีต้อนรับกลับสู่ NovaCoin</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {/* Google Sign-In Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center space-x-3 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 py-3 rounded-lg font-medium transition-all shadow-sm mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
              <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
              <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
              <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
            </svg>
            <span>เข้าสู่ระบบด้วย Google</span>
          </button>

          {/* Divider */}
          <div className="flex items-center mb-6">
            <div className="flex-1 border-t border-slate-200"></div>
            <span className="px-4 text-xs text-slate-400 font-medium">หรือเข้าสู่ระบบด้วยอีเมล</span>
            <div className="flex-1 border-t border-slate-200"></div>
          </div>

          {/* Email Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">อีเมล</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">รหัสผ่าน</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="รหัสผ่านของคุณ"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3 rounded-lg font-medium hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <p className="text-center mt-6 text-sm text-slate-500">
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" className="text-emerald-600 hover:text-emerald-700 font-medium">
              สมัครสมาชิก
            </Link>
          </p>

          {googleConfigChecked && !googleConfigured && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">
                ⚙️ ยังไม่ได้ตั้งค่า Google Login สำหรับ Admin: ใส่ GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET ในไฟล์ .env
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
