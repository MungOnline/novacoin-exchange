'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';

export default function AdminDashboard() {
  const { isAdmin, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push('/');
      return;
    }
    if (isAuthenticated && isAdmin) {
      loadData();
    }
  }, [isAuthenticated, isAdmin, authLoading]);

  async function loadData() {
    try {
      const dashboardData = await api.getAdminDashboard();
      setData(dashboardData);
    } catch (err) {
      console.error('Admin load error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Admin Panel</h1>
          <p className="text-slate-500">จัดการระบบ NovaCoin Exchange</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">ผู้ใช้ทั้งหมด</p>
          <p className="text-xl font-bold text-slate-800">{stats?.totalUsers || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">รอตรวจสอบสลิป</p>
          <p className="text-xl font-bold text-amber-600">{stats?.pendingDeposits || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">รออนุมัติถอนเงิน</p>
          <p className="text-xl font-bold text-amber-600">{stats?.pendingWithdrawals || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">คำสั่งซื้อขาย</p>
          <p className="text-xl font-bold text-slate-800">{stats?.totalOrders || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">รายการเทรด</p>
          <p className="text-xl font-bold text-slate-800">{stats?.totalTrades || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">ปริมาณเทรดรวม</p>
          <p className="text-xl font-bold text-slate-800">฿{stats?.totalTradeVolume?.toLocaleString('th-TH', { minimumFractionDigits: 0 }) || '0'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">THB ในระบบ</p>
          <p className="text-lg font-bold text-slate-800">฿{stats?.totalThbBalance?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0'}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">NVC ในระบบ</p>
          <p className="text-lg font-bold text-slate-800">{stats?.totalNvcBalance?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0'}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">เติมเงินวันนี้</p>
          <p className="text-lg font-bold text-emerald-600">฿{stats?.todayDeposits?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0'}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">รายการเติมเงิน</p>
          <p className="text-lg font-bold text-slate-800">{stats?.totalDeposits || 0}</p>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/deposits" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all group">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-800">ตรวจสอบสลิป</p>
              <p className="text-xs text-slate-500">จัดการคำขอเติมเงิน</p>
            </div>
          </div>
          {stats?.pendingDeposits > 0 && (
            <div className="mt-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full inline-block">
              รอดำเนินการ {stats.pendingDeposits} รายการ
            </div>
          )}
        </Link>

        <Link href="/admin/users" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-800">จัดการผู้ใช้</p>
              <p className="text-xs text-slate-500">ดูและจัดการสมาชิก</p>
            </div>
          </div>
        </Link>

        <Link href="/admin/trades" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-800">รายการซื้อขาย</p>
              <p className="text-xs text-slate-500">ดูประวัติการเทรด</p>
            </div>
          </div>
        </Link>

        <Link href="/admin/withdrawals" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-amber-300 transition-all group">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-800">คำขอถอนเงิน</p>
              <p className="text-xs text-slate-500">อนุมัติการถอนเงิน</p>
            </div>
          </div>
          {stats?.pendingWithdrawals > 0 && (
            <div className="mt-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full inline-block">
              รอดำเนินการ {stats.pendingWithdrawals} รายการ
            </div>
          )}
        </Link>

        <Link href="/admin/settings" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-800">ตั้งค่าระบบ</p>
              <p className="text-xs text-slate-500">ปรับแต่งระบบ</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Pending Withdrawals Preview */}
      {data?.recentPendingWithdrawals?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">คำขอถอนเงินล่าสุด</h2>
            <Link href="/admin/withdrawals" className="text-sm text-amber-600 hover:text-amber-700">ดูทั้งหมด</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentPendingWithdrawals.map((w, i) => (
              <div key={w.id || i} className="p-4 flex justify-between items-center hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-800">{w.email}</p>
                  <p className="text-xs text-slate-400">
                    -{Number(w.amount).toLocaleString()} NVC → ฿{Number(w.thb_amount).toLocaleString()} | {new Date(w.created_at).toLocaleString('th-TH')}
                  </p>
                  <p className="text-xs text-slate-400">{w.bank_name} | {w.bank_account}</p>
                </div>
                <Link href="/admin/withdrawals" className="text-xs text-amber-600 hover:text-amber-700 font-medium">ตรวจสอบ</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Deposits Preview */}
      {data?.recentPendingDeposits?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">รายการรอตรวจสอบล่าสุด</h2>
            <Link href="/admin/deposits" className="text-sm text-emerald-600 hover:text-emerald-700">ดูทั้งหมด</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentPendingDeposits.map((dep, i) => (
              <div key={dep.id || i} className="p-4 flex justify-between items-center hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-800">{dep.email}</p>
                  <p className="text-xs text-slate-400">+฿{dep.amount.toLocaleString()} | {new Date(dep.created_at).toLocaleString('th-TH')}</p>
                </div>
                <Link href="/admin/deposits" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">ตรวจสอบ</Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
