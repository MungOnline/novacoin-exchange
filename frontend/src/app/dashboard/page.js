'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';

export default function DashboardPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [wallets, setWallets] = useState(null);
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (isAuthenticated) {
      loadDashboard();
      const refreshInterval = setInterval(loadDashboard, 2000);
      return () => clearInterval(refreshInterval);
    }
  }, [isAuthenticated, authLoading]);

  async function loadDashboard() {
    try {
      const [walletData, statsData, txData] = await Promise.all([
        api.getWallets(),
        api.getMarketStats(),
        api.getTransactions(1),
      ]);
      setWallets(walletData.wallets);
      setStats(statsData);
      setTransactions(txData.transactions || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500">กำลังโหลด Dashboard...</p>
        </div>
      </div>
    );
  }

  const thbWallet = wallets?.find(w => w.currency === 'THB');
  const nvcWallet = wallets?.find(w => w.currency === 'NVC');
  const thbBalance = thbWallet ? thbWallet.balance - thbWallet.locked : 0;
  const nvcBalance = nvcWallet ? nvcWallet.balance - nvcWallet.locked : 0;
  const nvcValue = nvcBalance * (stats?.currentPrice || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500">ยินดีต้อนรับ, {user?.full_name || user?.email}</p>
        </div>
        <div className="flex space-x-3">
          <Link href="/deposit" className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
            + เติมเงิน
          </Link>
          <Link href="/buy" className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">
            ซื้อ NVC
          </Link>
        </div>
      </div>

      {/* Wallet Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">ยอดเงินคงเหลือ (THB)</p>
          <p className="text-2xl font-bold text-slate-800">
            ฿{thbBalance.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          {thbWallet && thbWallet.locked > 0 && (
            <p className="text-xs text-amber-500 mt-1">ถูกล็อค: ฿{thbWallet.locked.toFixed(2)}</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">เหรียญ NVC</p>
          <p className="text-2xl font-bold text-slate-800">{nvcBalance.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          {nvcWallet && nvcWallet.locked > 0 && (
            <p className="text-xs text-amber-500 mt-1">ถูกล็อค: {nvcWallet.locked.toFixed(2)} NVC</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">มูลค่า NVC</p>
          <p className="text-2xl font-bold text-emerald-600">
            ฿{nvcValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">ราคา NVC ล่าสุด</p>
          <p className="text-2xl font-bold text-slate-800">
            ฿{stats?.currentPrice?.toLocaleString('th-TH', { minimumFractionDigits: 7, maximumFractionDigits: 7 })}
          </p>
          <p className={`text-xs mt-1 ${
            stats?.priceChange24h?.startsWith('+') ? 'text-emerald-500' : 'text-red-500'
          }`}>
            {stats?.priceChange24h || '+0.00'}% (24ชม.)
          </p>
        </div>
      </div>

      {/* Quick Actions & Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">ดำเนินการด่วน</h3>
            <div className="space-y-3">
              <Link href="/buy" className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
                <div>
                  <p className="font-medium text-emerald-700 text-sm">ซื้อ NVC</p>
                  <p className="text-xs text-emerald-500">ใช้ THB ซื้อเหรียญ</p>
                </div>
                <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11l3-3m0 0l3 3m-3-3v8" />
                </svg>
              </Link>
              <Link href="/sell" className="flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                <div>
                  <p className="font-medium text-red-700 text-sm">ขาย NVC</p>
                  <p className="text-xs text-red-500">ขายเหรียญเป็น THB</p>
                </div>
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13l-3 3m0 0l-3-3m3 3V8" />
                </svg>
              </Link>
              <Link href="/deposit" className="flex items-center justify-between p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                <div>
                  <p className="font-medium text-blue-700 text-sm">เติมเงิน</p>
                  <p className="text-xs text-blue-500">โอนเงินเข้าบัญชี</p>
                </div>
                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </Link>
            </div>
          </div>

          {/* 2FA Status */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-2">ความปลอดภัย</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">2FA</span>
              <span className={`text-sm font-medium ${user?.twofa_enabled ? 'text-emerald-600' : 'text-amber-600'}`}>
                {user?.twofa_enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
              </span>
            </div>
            {!user?.twofa_enabled && (
              <Link href="/dashboard#security" className="text-xs text-emerald-600 hover:text-emerald-700 mt-1 inline-block">
                เปิดใช้งาน 2FA
              </Link>
            )}
          </div>
        </div>

        {/* Transactions */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">ประวัติธุรกรรมล่าสุด</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p>ยังไม่มีรายการธุรกรรม</p>
                  <Link href="/buy" className="text-emerald-600 hover:text-emerald-700 text-sm mt-2 inline-block">
                    เริ่มซื้อขายตอนนี้
                  </Link>
                </div>
              ) : (
                transactions.map((tx, i) => (
                  <div key={tx.id || i} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          tx.type === 'trade' 
                            ? (tx.action === 'buy' ? 'bg-emerald-100' : 'bg-red-100')
                            : 'bg-blue-100'
                        }`}>
                          <svg className={`w-4 h-4 ${
                            tx.type === 'trade'
                              ? (tx.action === 'buy' ? 'text-emerald-600' : 'text-red-600')
                              : 'text-blue-600'
                          }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {tx.type === 'trade' ? (
                              tx.action === 'buy'
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            )}
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {tx.type === 'trade' 
                              ? (tx.action === 'buy' ? 'ซื้อ NVC' : 'ขาย NVC')
                              : 'เติมเงิน'
                            }
                          </p>
                          <p className="text-xs text-slate-400">
                            {new Date(tx.created_at).toLocaleString('th-TH')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${
                          tx.type === 'trade'
                            ? (tx.action === 'buy' ? 'text-emerald-600' : 'text-red-600')
                            : 'text-blue-600'
                        }`}>
                          {tx.type === 'trade'
                            ? (tx.action === 'buy' ? '+' : '-') + tx.amount + ' NVC'
                            : '+' + tx.amount.toLocaleString() + ' บาท'
                          }
                        </p>
                        {tx.status && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            tx.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                            tx.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            tx.status === 'rejected' ? 'bg-red-100 text-red-700' : ''
                          }`}>
                            {tx.status === 'approved' ? 'สำเร็จ' : tx.status === 'pending' ? 'รอตรวจสอบ' : 'ปฏิเสธ'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
