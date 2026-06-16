'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../lib/api';

export default function AdminDeposits() {
  const { isAdmin, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [deposits, setDeposits] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [slipModal, setSlipModal] = useState(null); // { id, data, filename } | null

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push('/');
      return;
    }
    if (isAuthenticated && isAdmin) {
      loadDeposits();
    }
  }, [isAuthenticated, isAdmin, authLoading, status]);

  async function loadDeposits() {
    try {
      const data = await api.getDeposits(status);
      setDeposits(data.deposits || []);
    } catch (err) {
      console.error('Load deposits error:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await api.approveDeposit(id);
      await loadDeposits();
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
      await api.rejectDeposit(id, note);
      await loadDeposits();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewSlip = async (depositId, filename) => {
    try {
      const data = await api.getDepositSlip(depositId);
      setSlipModal({ id: depositId, data: data.slipData, filename: data.slipFilename || filename });
    } catch (err) {
      alert(err.message);
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
          <h1 className="text-2xl font-bold text-slate-800">ตรวจสอบสลิป</h1>
          <p className="text-slate-500">จัดการคำขอเติมเงินจากผู้ใช้</p>
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
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Deposits Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">ผู้ใช้</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">จำนวนเงิน</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">สลิป</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">วันที่</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">สถานะ</th>
                {status === 'pending' && <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deposits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">ไม่มีรายการ</td>
                </tr>
              ) : (
                deposits.map((dep, i) => (
                  <tr key={dep.id || i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{dep.full_name || dep.email}</p>
                      <p className="text-xs text-slate-400">{dep.email}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-bold text-slate-800">+฿{dep.amount.toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {dep.slip_filename ? (
                        <button
                          onClick={() => handleViewSlip(dep.id, dep.slip_filename)}
                          className="text-xs text-emerald-600 hover:text-emerald-700 underline cursor-pointer"
                        >
                          ดูสลิป
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">ไม่มี</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-slate-600">{new Date(dep.created_at).toLocaleString('th-TH')}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        dep.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        dep.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {dep.status === 'approved' ? 'อนุมัติ' :
                         dep.status === 'pending' ? 'รอตรวจสอบ' : 'ปฏิเสธ'}
                      </span>
                    </td>
                    {status === 'pending' && (
                      <td className="px-4 py-3">
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => handleApprove(dep.id)}
                            disabled={actionLoading === dep.id}
                            className="px-3 py-1.5 bg-emerald-500 text-white text-xs rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === dep.id ? '...' : 'อนุมัติ'}
                          </button>
                          <button
                            onClick={() => handleReject(dep.id)}
                            disabled={actionLoading === dep.id}
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

      {/* Slip Image Modal */}
      {slipModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSlipModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">สลิปการโอนเงิน</h3>
              <button
                onClick={() => setSlipModal(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              {slipModal.data ? (
                <img
                  src={slipModal.data}
                  alt={slipModal.filename || 'สลิปโอนเงิน'}
                  className="w-full h-auto rounded-lg"
                />
              ) : (
                <p className="text-center text-slate-400 py-8">ไม่พบรูปสลิป</p>
              )}
            </div>
            {slipModal.filename && (
              <div className="px-4 pb-4 text-xs text-slate-400 text-center">
                {slipModal.filename}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
