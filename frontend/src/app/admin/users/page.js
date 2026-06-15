'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../lib/api';

export default function AdminUsers() {
  const { isAdmin, isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [banLoading, setBanLoading] = useState(null);

  // Wallet Adjustment State
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [adjustCurrency, setAdjustCurrency] = useState('THB');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState('');
  const [adjustSuccess, setAdjustSuccess] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  // PIN Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // Store action to execute after PIN

  // Audit Logs
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditUser, setAuditUser] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push('/');
      return;
    }
    if (isAuthenticated && isAdmin) {
      loadUsers();
    }
  }, [isAuthenticated, isAdmin, authLoading, page]);

  async function loadUsers() {
    try {
      const data = await api.getUsers(page);
      setUsers(data.users || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Load users error:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleBan = async (id) => {
    setBanLoading(id);
    try {
      await api.banUser(id);
      await loadUsers();
    } catch (err) {
      alert(err.message);
    } finally {
      setBanLoading(null);
    }
  };

  // ============ WALLET ADJUSTMENT ============

  const openAdjustModal = (user) => {
    setSelectedUser(user);
    setAdjustCurrency('THB');
    setAdjustAmount('');
    setAdjustReason('');
    setAdjustError('');
    setAdjustSuccess('');
    setShowAdjustModal(true);
  };

  const handleAdjustSubmit = async () => {
    setAdjustError('');
    setAdjustSuccess('');

    // Validate
    const amount = parseFloat(adjustAmount);
    if (!amount || amount <= 0) {
      setAdjustError('กรุณากรอกจำนวนเงินที่ถูกต้อง');
      return;
    }
    if (amount > 10000000) {
      setAdjustError('จำนวนเงินสูงสุดต่อครั้งคือ 10,000,000');
      return;
    }
    if (!adjustReason || adjustReason.trim().length < 5) {
      setAdjustError('กรุณาระบุเหตุผล (อย่างน้อย 5 ตัวอักษร)');
      return;
    }

    // Save pending action and request PIN
    setPendingAction({
      type: 'wallet_adjust',
      userId: selectedUser.id,
      currency: adjustCurrency,
      amount: amount,
      reason: adjustReason.trim()
    });
    setShowAdjustModal(false);
    setShowPinModal(true);
    setPinCode('');
    setPinError('');
  };

  const executeWalletAdjust = async (adminPin) => {
    if (!pendingAction) return;
    
    setAdjustLoading(true);
    try {
      const result = await api.adjustWallet(
        pendingAction.userId,
        pendingAction.currency,
        pendingAction.amount,
        pendingAction.reason,
        adminPin
      );
      setAdjustSuccess(`✅ ${result.message}`);

      // Refresh user list
      await loadUsers();
    } catch (err) {
      setAdjustError(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setAdjustLoading(false);
      setPendingAction(null);
    }
  };

  // ============ PIN VERIFICATION ============

  const handlePinSubmit = async () => {
    if (!pinCode || pinCode.length < 4) {
      setPinError('กรุณากรอกรหัส PIN');
      return;
    }

    setPinLoading(true);
    setPinError('');

    try {
      const result = await api.verifyAdminPin(pinCode);

      setShowPinModal(false);
      setPinCode('');

      // Execute the pending action with PIN
      if (pendingAction) {
        if (pendingAction.type === 'wallet_adjust') {
          await executeWalletAdjust(pinCode);
        }
      }

      // Reopen adjust modal to show result
      if (selectedUser) {
        setShowAdjustModal(true);
      }
    } catch (err) {
      setPinError(err.message || 'รหัส PIN ไม่ถูกต้อง');
    } finally {
      setPinLoading(false);
    }
  };

  // ============ AUDIT LOGS ============

  const openAuditModal = async (user) => {
    setAuditUser(user);
    setShowAuditModal(true);
    setAuditLoading(true);
    try {
      const data = await api.getWalletAuditLogs(user.id);
      setAuditLogs(data.logs || []);
    } catch (err) {
      console.error('Load audit logs error:', err);
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  };

  // ============ RENDER ============

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">จัดการผู้ใช้</h1>
          <p className="text-slate-500">ดูและจัดการสมาชิกทั้งหมด ({users.length} คน)</p>
        </div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">← กลับ</Link>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">ชื่อ</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">อีเมล</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">THB</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">NVC</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">2FA</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">ยืนยันอีเมล</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">วันที่สมัคร</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">สถานะ</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u, i) => (
                <tr key={u.id || i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800">{u.full_name || '-'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-600">{u.email}</p>
                    {u.is_admin && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Admin</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium">฿{(u.thb_balance || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    {(u.thb_locked || 0) > 0 && (
                      <p className="text-xs text-amber-500">Locked: ฿{(u.thb_locked || 0).toFixed(2)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium">{(u.nvc_balance || 0).toFixed(2)}</span>
                    {(u.nvc_locked || 0) > 0 && (
                      <p className="text-xs text-amber-500">Locked: {(u.nvc_locked || 0).toFixed(2)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${u.twofa_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {u.twofa_enabled ? 'เปิด' : 'ปิด'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${u.email_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {u.email_verified ? 'ใช่' : 'ไม่'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-slate-500">
                    {new Date(u.created_at).toLocaleDateString('th-TH')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      u.is_banned ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {u.is_banned ? 'ถูกแบน' : 'ปกติ'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      {!u.is_admin && (
                        <>
                          <button
                            onClick={() => openAdjustModal(u)}
                            className="text-xs px-2 py-1.5 rounded-lg font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                            title="เติมเงิน/ปรับยอด"
                          >
                            💰 เติมเงิน
                          </button>
                          <button
                            onClick={() => openAuditModal(u)}
                            className="text-xs px-2 py-1.5 rounded-lg font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                            title="ดูประวัติการปรับยอด"
                          >
                            📋 ประวัติ
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleBan(u.id)}
                        disabled={banLoading === u.id || u.is_admin}
                        className={`text-xs px-2 py-1.5 rounded-lg font-medium transition-colors ${
                          u.is_banned
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {banLoading === u.id ? '...' : u.is_banned ? 'ปลดแบน' : 'แบน'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center space-x-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-3 py-1.5 text-sm rounded-lg ${
                page === p
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* ============ WALLET ADJUST MODAL ============ */}
      {showAdjustModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-slate-800">ปรับยอดเงินผู้ใช้</h2>
              <button onClick={() => { setShowAdjustModal(false); setAdjustSuccess(''); }} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-slate-800">{selectedUser.full_name || selectedUser.email}</p>
              <p className="text-xs text-slate-500">{selectedUser.email}</p>
            </div>

            {adjustSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm mb-4">
                {adjustSuccess}
              </div>
            )}

            {!adjustSuccess && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">สกุลเงิน</label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setAdjustCurrency('THB')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        adjustCurrency === 'THB'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      ฿ THB
                    </button>
                    <button
                      onClick={() => setAdjustCurrency('NVC')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        adjustCurrency === 'NVC'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      N NVC
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    จำนวน (ใส่ + เพื่อเพิ่ม, - เพื่อหัก)
                  </label>
                  <input
                    type="number"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    step={adjustCurrency === 'THB' ? '0.01' : '0.0001'}
                    placeholder={adjustCurrency === 'THB' ? '1000' : '100'}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    ปัจจุบัน: {adjustCurrency === 'THB' 
                      ? `฿${(selectedUser.thb_balance || 0).toLocaleString()}`
                      : `${(selectedUser.nvc_balance || 0).toFixed(2)} NVC`
                    }
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">เหตุผล</label>
                  <textarea
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="ระบุเหตุผลในการปรับยอด..."
                    rows={3}
                    maxLength={500}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                  <p className="text-xs text-slate-400 mt-1">{adjustReason.length}/500</p>
                </div>

                {adjustError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">{adjustError}</div>
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowAdjustModal(false)}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleAdjustSubmit}
                    disabled={adjustLoading || !adjustAmount || !adjustReason}
                    className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg text-sm font-medium hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {adjustLoading ? 'กำลังดำเนินการ...' : 'ยืนยัน (ยืนยัน 2FA)'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============ PIN VERIFICATION MODAL ============ */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-800">ยืนยันรหัส PIN Admin</h2>
              <p className="text-sm text-slate-500 mt-1">กรุณากรอกรหัส PIN เพื่อดำเนินการ</p>
            </div>

            <input
              type="password"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="141200"
              maxLength={6}
              className="w-full text-center text-2xl tracking-[0.5em] px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono"
              autoFocus
            />

            {pinError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mt-4">{pinError}</div>
            )}

            <div className="flex space-x-3 mt-4">
              <button
                onClick={() => { setShowPinModal(false); setPendingAction(null); setPinCode(''); }}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handlePinSubmit}
                disabled={pinLoading || pinCode.length < 4}
                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg text-sm font-medium hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {pinLoading ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ AUDIT LOGS MODAL ============ */}
      {showAuditModal && auditUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">ประวัติการปรับยอด</h2>
                <p className="text-sm text-slate-500">{auditUser.full_name || auditUser.email}</p>
              </div>
              <button onClick={() => setShowAuditModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {auditLoading ? (
              <div className="text-center py-8 text-slate-400">กำลังโหลด...</div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-400">ยังไม่มีประวัติการปรับยอด</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {auditLogs.map((log, i) => (
                  <div key={log.id || i} className="py-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {log.details?.currency} {log.details?.amount > 0 ? '+' : ''}{log.details?.amount?.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-500">
                          โดย {log.admin_name || log.admin_email} 
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          เหตุผล: {log.details?.reason || '-'}
                        </p>
                        {log.details?.balanceBefore !== undefined && (
                          <p className="text-xs text-slate-400">
                            ยอดก่อน: {log.details.balanceBefore} → ยอดหลัง: {log.details.balanceAfter}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
                        {new Date(log.created_at).toLocaleString('th-TH')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
