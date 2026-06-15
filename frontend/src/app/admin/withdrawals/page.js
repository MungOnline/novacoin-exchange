'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../lib/api';

export default function AdminWithdrawals() {
  const { isAdmin, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [withdrawals, setWithdrawals] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push('/');
      return;
    }
    if (isAuthenticated && isAdmin) {
      loadWithdrawals();
    }
  }, [isAuthenticated, isAdmin, authLoading, status]);

  async function loadWithdrawals() {
    try {
      const data = await api.getAdminWithdrawals(status);
      setWithdrawals(data.withdrawals || []);
    } catch (err) {
      console.error('Load withdrawals error:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await api.approveWithdrawal(id);
      await loadWithdrawals();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id) => {
    const note = prompt('กรุณาระบุเหตุผลที่ปฏิเสธ (หรือกดตกลงเพื่อยืนยัน):');
    if (note === null) return;
    setActionLoading(id);
    try {
      await api.rejectWithdrawal(id, note || '');
      await loadWithdrawals();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const statusTabs = [
    { key: 'pending', label: 'รอตรวจสอบ' },
    { key: 'approved', label: 'อนุมัติแล้ว' },
    { key: 'rejected', label: 'ปฏิเสธ' },
    { key: 'all', label: 'ทั้งหมด' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">จัดการคำขอถอนเงิน</h1>
          <p className="text-slate-500">ตรวจสอบและอนุมัติคำขอถอนเงินจากผู้ใช้</p>
        </div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">← กลับ</Link>
      </div>

      {/* Status Tabs */}
      <div className="flex space-x-2 bg-slate-100 rounded-lg p-1 w-fit">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              status === tab.key
                ? 'bg-white text-amber-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Withdrawals Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">ผู้ใช้</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">จำนวน NVC</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">รับเงิน (THB)</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">บัญชีธนาคาร</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">วันที่</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">สถานะ</th>
                {status === 'pending' && <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={status === 'pending' ? 8 : 7} className="px-4 py-8 text-center text-slate-400">ไม่มีรายการ</td>
                </tr>
              ) : (
                withdrawals.map((w, i) => (
                  <tr key={w.id || i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{w.full_name || w.email}</p>
                      <p className="text-xs text-slate-400">{w.email}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-bold text-slate-800">{Number(w.amount).toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-bold text-emerald-600">฿{Number(w.thb_amount).toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-800">{w.bank_name}</p>
                      <p className="text-xs text-slate-400">{w.account_name} | {w.bank_account}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-slate-600">{new Date(w.created_at).toLocaleString('th-TH')}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        w.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        w.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {w.status === 'approved' ? 'อนุมัติ' :
                         w.status === 'pending' ? 'รอตรวจสอบ' : 'ปฏิเสธ'}
                      </span>
                    </td>
                    {status === 'pending' && (
                      <td className="px-4 py-3">
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => handleApprove(w.id)}
                            disabled={actionLoading === w.id}
                            className="px-3 py-1.5 bg-emerald-500 text-white text-xs rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === w.id ? '...' : 'อนุมัติ'}
                          </button>
                          <button
                            onClick={() => handleReject(w.id)}
                            disabled={actionLoading === w.id}
                            className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
