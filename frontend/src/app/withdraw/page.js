'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';

export default function WithdrawPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const [nvcPrice, setNvcPrice] = useState(0);
  const [minAmount, setMinAmount] = useState(100);
  const [maxAmount, setMaxAmount] = useState(1000000);
  const [withdrawals, setWithdrawals] = useState([]);
  const [wallets, setWallets] = useState({ thb: 0, nvc: 0 });

  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, authLoading]);

  async function loadData() {
    try {
      const [infoData, withdrawData, walletData] = await Promise.all([
        api.getWithdrawInfo(),
        api.getWithdrawals(),
        api.getWallets(),
      ]);
      setNvcPrice(infoData.nvcPrice);
      setMinAmount(infoData.minAmount);
      setMaxAmount(infoData.maxAmount);
      setWithdrawals(withdrawData.withdrawals || []);
      const thbWallet = walletData.wallets?.find(w => w.currency === 'THB');
      const nvcWallet = walletData.wallets?.find(w => w.currency === 'NVC');
      setWallets({
        thb: thbWallet?.balance || 0,
        nvc: nvcWallet?.balance || 0,
      });
    } catch (err) {
      console.error('Load withdraw data error:', err);
    } finally {
      setLoading(false);
    }
  }

  const estimatedThb = amount && parseFloat(amount) > 0
    ? (parseFloat(amount) * nvcPrice).toFixed(2)
    : '0.00';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      const result = await api.createWithdrawal(
        parseFloat(amount),
        bankName.trim(),
        bankAccount.trim(),
        accountName.trim()
      );
      setMessage(`✅ ส่งคำขอถอนเงินแล้ว! รอแอดมินตรวจสอบ (ประมาณ ${Number(result.thbAmount).toLocaleString()} บาท)`);
      setAmount('');
      setBankName('');
      setBankAccount('');
      setAccountName('');
      // Refresh data
      const [withdrawData, walletData] = await Promise.all([
        api.getWithdrawals(),
        api.getWallets(),
      ]);
      setWithdrawals(withdrawData.withdrawals || []);
      const thbWallet = walletData.wallets?.find(w => w.currency === 'THB');
      const nvcWallet = walletData.wallets?.find(w => w.currency === 'NVC');
      setWallets({
        thb: thbWallet?.balance || 0,
        nvc: nvcWallet?.balance || 0,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">ถอนเงิน</h1>
        <p className="text-slate-500">แปลง NVC เป็นเงินบาทเข้าบัญชีธนาคารของคุณ</p>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl border border-emerald-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">ยอด NVC คงเหลือ</p>
          <p className="text-xl font-bold text-slate-800">{wallets.nvc.toLocaleString('th-TH', { minimumFractionDigits: 2 })} NVC</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">ยอด THB คงเหลือ</p>
          <p className="text-xl font-bold text-slate-800">฿{wallets.thb.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column - Form */}
        <div className="lg:col-span-3 space-y-6">
          {/* Withdrawal Info Card */}
          <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl border border-amber-200 p-6 shadow-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-slate-800">ข้อมูลการถอนเงิน</h2>
                <p className="text-xs text-slate-400">ราคา NVC ปัจจุบัน: <strong className="text-slate-600">1 NVC = ฿{nvcPrice.toFixed(7)}</strong></p>
              </div>
            </div>

            <div className="p-3 bg-amber-100/50 rounded-lg flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-amber-700">
                ถอนขั้นต่ำ <strong>{minAmount.toLocaleString()} NVC</strong> สูงสุด <strong>{maxAmount.toLocaleString()} NVC</strong>
                &nbsp;— เงินจะถูกโอนเข้าบัญชีธนาคารหลังจากแอดมินตรวจสอบ
              </p>
            </div>
          </div>

          {/* Withdrawal Form */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">แบบฟอร์มถอนเงิน</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* NVC Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">จำนวน NVC ที่ต้องการถอน</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`เช่น ${minAmount}`}
                    min={minAmount}
                    max={maxAmount}
                    step="100"
                    className="w-full pl-4 pr-16 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">NVC</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  ประมาณการรับ: <strong className="text-emerald-600">฿{Number(estimatedThb).toLocaleString()}</strong>
                  &nbsp;(อัตรา 1 NVC = ฿{nvcPrice.toFixed(7)})
                </p>
              </div>

              {/* Bank Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ธนาคาร</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  required
                >
                  <option value="">เลือกธนาคาร</option>
                  <option value="ธนาคารกรุงเทพ">ธนาคารกรุงเทพ</option>
                  <option value="ธนาคารกสิกรไทย">ธนาคารกสิกรไทย</option>
                  <option value="ธนาคารไทยพาณิชย์">ธนาคารไทยพาณิชย์</option>
                  <option value="ธนาคารกรุงไทย">ธนาคารกรุงไทย</option>
                  <option value="ธนาคารกรุงศรีอยุธยา">ธนาคารกรุงศรีอยุธยา</option>
                  <option value="ธนาคารทหารไทยธนชาต">ธนาคารทหารไทยธนชาต</option>
                  <option value="ธนาคารอิสลามแห่งประเทศไทย">ธนาคารอิสลามแห่งประเทศไทย</option>
                  <option value="ธนาคารอาคารสงเคราะห์">ธนาคารอาคารสงเคราะห์</option>
                  <option value="ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร">ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร</option>
                  <option value="อื่นๆ">อื่นๆ</option>
                </select>
              </div>

              {/* Account Number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">เลขที่บัญชี</label>
                <input
                  type="text"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value.replace(/[^0-9-]/g, ''))}
                  placeholder="เช่น 123-4-56789-0"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  required
                  maxLength={20}
                />
              </div>

              {/* Account Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อบัญชี</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="ชื่อ-นามสกุล ตามบัญชีธนาคาร"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              {message && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">{message}</div>
              )}

              <button
                type="submit"
                disabled={submitting || !amount || parseFloat(amount) < minAmount || parseFloat(amount) > wallets.nvc}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white py-3 rounded-lg font-medium hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอถอนเงิน'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column - Withdrawal History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Current Price Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-3">ราคาปัจจุบัน</h2>
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-800">฿{nvcPrice.toFixed(7)}</p>
              <p className="text-sm text-slate-400 mt-1">ต่อ 1 NVC</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">NVC คงเหลือ</p>
                <p className="text-base font-bold text-slate-800">{wallets.nvc.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">มูลค่าโดยประมาณ</p>
                <p className="text-base font-bold text-emerald-600">฿{(wallets.nvc * nvcPrice).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>

          {/* Withdrawal History */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">ประวัติการถอนเงิน</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {withdrawals.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p>ยังไม่มีรายการถอนเงิน</p>
                </div>
              ) : (
                withdrawals.map((w, i) => (
                  <div key={w.id || i} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          -{Number(w.amount).toLocaleString()} NVC
                        </p>
                        <p className="text-xs text-slate-400">
                          ≈ ฿{Number(w.thb_amount).toLocaleString()} | {new Date(w.created_at).toLocaleString('th-TH')}
                        </p>
                        {w.bank_name && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {w.bank_name} | {w.bank_account}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        w.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        w.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {w.status === 'approved' ? 'อนุมัติแล้ว' :
                         w.status === 'pending' ? 'รอตรวจสอบ' : 'ปฏิเสธ'}
                      </span>
                    </div>
                    {w.notes && (
                      <p className="text-xs text-slate-400 mt-1">หมายเหตุ: {w.notes}</p>
                    )}
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
