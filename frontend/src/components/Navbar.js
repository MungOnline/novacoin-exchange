'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, logout, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Never show loading skeleton — always show navigation links
  // The auth state will update asynchronously
  return (
    <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 group">
            <svg className="w-8 h-8" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="navLogoGrad" cx="36%" cy="30%" r="65%">
                  <stop offset="0%" stop-color="#a7f3d0"/>
                  <stop offset="25%" stop-color="#34d399"/>
                  <stop offset="60%" stop-color="#059669"/>
                  <stop offset="100%" stop-color="#064e3b"/>
                </radialGradient>
                <linearGradient id="navRimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#6ee7b7"/>
                  <stop offset="50%" stop-color="#10b981"/>
                  <stop offset="100%" stop-color="#047857"/>
                </linearGradient>
                <radialGradient id="navShine" cx="28%" cy="22%" r="50%">
                  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3"/>
                  <stop offset="60%" stop-color="#ffffff" stop-opacity="0.05"/>
                  <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
                </radialGradient>
                <filter id="navGlow">
                  <feGaussianBlur stdDeviation="2" result="blur"/>
                  <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <circle cx="64" cy="64" r="62" fill="url(#navRimGrad)"/>
              <circle cx="64" cy="64" r="58" fill="none" stroke="#6ee7b7" stroke-width="1" opacity="0.4"/>
              <circle cx="64" cy="64" r="56" fill="url(#navLogoGrad)"/>
              <circle cx="64" cy="64" r="48" fill="none" stroke="#6ee7b7" stroke-width="0.8" opacity="0.2"/>
              <circle cx="64" cy="64" r="54" fill="none" stroke="#34d399" stroke-width="0.5" stroke-dasharray="2 4" opacity="0.25"/>
              <circle cx="64" cy="64" r="56" fill="url(#navShine)"/>
              <g opacity="0.35" filter="url(#navGlow)">
                <path d="M64 28 C67 58 64 66 75 70 C64 66 61 58 64 28Z" fill="#a7f3d0"/>
                <path d="M64 100 C61 70 64 62 53 58 C64 62 67 70 64 100Z" fill="#a7f3d0"/>
                <path d="M28 64 C58 61 66 64 70 53 C66 64 58 67 28 64Z" fill="#a7f3d0"/>
                <path d="M100 64 C70 67 62 64 58 75 C62 64 70 61 100 64Z" fill="#a7f3d0"/>
              </g>
              <path d="M44 46 L44 82 L50 82 L50 62 L66 82 L84 82 L84 46 L78 46 L78 66 L62 46 Z" fill="#ffffff" opacity="0.95" filter="url(#navGlow)"/>
              <circle cx="36" cy="52" r="2" fill="#a7f3d0" opacity="0.6" filter="url(#navGlow)"/>
              <circle cx="92" cy="50" r="1.8" fill="#a7f3d0" opacity="0.5" filter="url(#navGlow)"/>
              <circle cx="34" cy="74" r="1.5" fill="#a7f3d0" opacity="0.4"/>
              <circle cx="94" cy="76" r="1.2" fill="#a7f3d0" opacity="0.3"/>
            </svg>
            <span className="font-bold text-xl text-slate-800">NovaCoin</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/" className="text-slate-600 hover:text-emerald-600 transition-colors text-sm font-medium">
              หน้าแรก
            </Link>

            {isAuthenticated && (
              <>
                <Link href="/dashboard" className="text-slate-600 hover:text-emerald-600 transition-colors text-sm font-medium">
                  Dashboard
                </Link>
                <Link href="/buy" className="text-slate-600 hover:text-emerald-600 transition-colors text-sm font-medium">
                  ซื้อ NVC
                </Link>
                <Link href="/sell" className="text-slate-600 hover:text-emerald-600 transition-colors text-sm font-medium">
                  ขาย NVC
                </Link>
                <Link href="/deposit" className="text-slate-600 hover:text-emerald-600 transition-colors text-sm font-medium">
                  เติมเงิน
                </Link>
                <Link href="/withdraw" className="text-slate-600 hover:text-amber-600 transition-colors text-sm font-medium">
                  ถอนเงิน
                </Link>
                {isAdmin && (
                  <Link href="/admin" className="text-slate-600 hover:text-emerald-600 transition-colors text-sm font-medium">
                    Admin
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center space-x-3">
            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-800">{user?.full_name || user?.email}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                </div>
                <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {(user?.full_name || user?.email || 'U')[0].toUpperCase()}
                </div>
                <button
                  onClick={logout}
                  className="text-sm text-red-500 hover:text-red-700 transition-colors font-medium"
                >
                  ออกจากระบบ
                </button>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors px-4 py-2"
                >
                  เข้าสู่ระบบ
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 px-5 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                >
                  สมัครสมาชิก
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden pb-4 animate-fadeIn">
            <div className="flex flex-col space-y-2 border-t border-slate-100 pt-4">
              <Link href="/" className="text-slate-600 hover:text-emerald-600 px-3 py-2 rounded-lg hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                หน้าแรก
              </Link>
              {isAuthenticated ? (
                <>
                  <Link href="/dashboard" className="text-slate-600 hover:text-emerald-600 px-3 py-2 rounded-lg hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                    Dashboard
                  </Link>
                  <Link href="/buy" className="text-slate-600 hover:text-emerald-600 px-3 py-2 rounded-lg hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                    ซื้อ NVC
                  </Link>
                  <Link href="/sell" className="text-slate-600 hover:text-emerald-600 px-3 py-2 rounded-lg hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                    ขาย NVC
                  </Link>
                  <Link href="/deposit" className="text-slate-600 hover:text-emerald-600 px-3 py-2 rounded-lg hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                    เติมเงิน
                  </Link>
                  <Link href="/withdraw" className="text-slate-600 hover:text-amber-600 px-3 py-2 rounded-lg hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                    ถอนเงิน
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" className="text-slate-600 hover:text-emerald-600 px-3 py-2 rounded-lg hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                      Admin Panel
                    </Link>
                  )}
                  <hr className="border-slate-100" />
                  <button onClick={() => { logout(); setMenuOpen(false); }} className="text-left text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50">
                    ออกจากระบบ
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-slate-600 hover:text-emerald-600 px-3 py-2 rounded-lg hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                    เข้าสู่ระบบ
                  </Link>
                  <Link href="/register" className="text-emerald-600 hover:text-emerald-700 px-3 py-2 rounded-lg hover:bg-emerald-50" onClick={() => setMenuOpen(false)}>
                    สมัครสมาชิก
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
