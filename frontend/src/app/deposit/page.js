'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!navigator.clipboard) setSupported(false);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setSupported(false);
    }
  };

  if (!supported) return null;

  return (
    <button
      onClick={handleCopy}
      className={`ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
        copied
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'
      }`}
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          คัดลอกแล้ว
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          คัดลอก
        </>
      )}
    </button>
  );
}

export default function DepositPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const [bankInfo, setBankInfo] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [amount, setAmount] = useState('');
  const [slipFile, setSlipFile] = useState(null);
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
      const [infoData, depositData] = await Promise.all([
        api.getDepositInfo(),
        api.getDeposits(),
      ]);
      setBankInfo(infoData.bank);
      setQrCode(infoData.qrCode || null);
      setDeposits(depositData.deposits || []);
    } catch (err) {
      console.error('Load deposit data error:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('amount', amount);
      if (slipFile) {
        formData.append('slip', slipFile);
      }

      const result = await api.createDeposit(formData);
      setMessage('✅ ส่งคำขอเติมเงินแล้ว! รอแอดมินตรวจสอบ');
      setAmount('');
      setSlipFile(null);
      // Refresh deposits
      const depositData = await api.getDeposits();
      setDeposits(depositData.deposits || []);
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
        <h1 className="text-2xl font-bold text-slate-800">เติมเงิน</h1>
        <p className="text-slate-500">โอนเงินเข้าบัญชีและแนบสลิปเพื่อเติมเงินเข้าระบบ</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column - Bank Info + Form */}
        <div className="lg:col-span-3 space-y-6">
          {/* Bank Info Card */}
          {bankInfo && (
            <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl border border-emerald-200 p-6 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-800">บัญชีสำหรับโอนเงิน</h2>
                    <p className="text-xs text-slate-400">กรุณาโอนเงินไปที่บัญชีด้านล่าง</p>
                  </div>
                </div>
                {qrCode && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                    พร้อม QR Code
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div className="bg-white rounded-lg p-4 border border-emerald-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">ธนาคาร</p>
                      <p className="text-base font-semibold text-slate-800">{bankInfo.name}</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <span className="text-2xl font-bold text-emerald-600">
                        {bankInfo.name?.charAt(0) || 'ธ'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 border border-emerald-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">เลขที่บัญชี</p>
                      <p className="text-lg font-bold text-slate-800 tracking-wider">{bankInfo.accountNumber}</p>
                    </div>
                    <CopyButton text={bankInfo.accountNumber} />
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 border border-emerald-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">ชื่อบัญชี</p>
                      <p className="text-base font-semibold text-slate-800">{bankInfo.accountName}</p>
                    </div>
                    <CopyButton text={bankInfo.accountName} />
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-emerald-100/50 rounded-lg flex items-start gap-2">
                <svg className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-emerald-700">
                  โอนเงินตามจำนวนที่ต้องการแล้วแนบสลิปด้านล่าง เติมเงินขั้นต่ำ <strong>100 บาท</strong>
                </p>
              </div>
            </div>
          )}

          {/* Slip Form */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">แนบสลิปการโอน</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนเงิน (บาท)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="เช่น 1000"
                    min="100"
                    step="100"
                    className="w-full pl-4 pr-12 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">บาท</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">ขั้นต่ำ 100 บาท</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">แนบสลิปโอนเงิน</label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-emerald-400 transition-colors">
                  {slipFile ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-emerald-600 font-medium">{slipFile.name}</p>
                      </div>
                      <p className="text-xs text-slate-400">{(slipFile.size / 1024).toFixed(1)} KB</p>
                      <button
                        type="button"
                        onClick={() => setSlipFile(null)}
                        className="text-xs text-red-500 hover:text-red-700 underline"
                      >
                        เปลี่ยนไฟล์
                      </button>
                    </div>
                  ) : (
                    <div>
                      <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm text-slate-500 mb-1">คลิกเพื่อเลือกรูปสลิป</p>
                      <p className="text-xs text-slate-400">JPG, PNG, PDF (สูงสุด 5MB)</p>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setSlipFile(e.target.files[0])}
                        className="hidden"
                        id="slip-upload"
                      />
                      <label
                        htmlFor="slip-upload"
                        className="mt-3 inline-block px-5 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm cursor-pointer hover:bg-slate-200 transition-colors"
                      >
                        เลือกไฟล์
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              {message && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">{message}</div>
              )}

              <button
                type="submit"
                disabled={submitting || !amount || parseFloat(amount) < 100}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3 rounded-lg font-medium hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอเติมเงิน'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column - QR Code + History */}
        <div className="lg:col-span-2 space-y-6">
          {/* QR Code Card */}
          {qrCode ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm text-center">
              <h2 className="font-semibold text-slate-800 mb-3">สแกน QR Code</h2>
              <div className="bg-white rounded-lg p-3 inline-block border border-slate-100 shadow-sm">
                <img
                  src={qrCode}
                  alt="QR Code สำหรับโอนเงิน"
                  className="w-48 h-48 object-contain mx-auto rounded-md"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <p className="hidden text-sm text-red-500 mt-2">ไม่สามารถแสดง QR Code ได้</p>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                เปิดแอปธนาคารแล้วสแกน QR Code นี้เพื่อโอนเงิน
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm text-center">
              <div className="w-48 h-48 mx-auto flex items-center justify-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <div>
                  <svg className="w-12 h-12 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  <p className="text-sm text-slate-400">ยังไม่มี QR Code</p>
                </div>
              </div>
            </div>
          )}

          {/* Deposit History */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">ประวัติการเติมเงิน</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {deposits.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>ยังไม่มีรายการเติมเงิน</p>
                </div>
              ) : (
                deposits.map((dep, i) => (
                  <div key={dep.id || i} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          +฿{Number(dep.amount).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(dep.created_at).toLocaleString('th-TH')}
                        </p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        dep.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        dep.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {dep.status === 'approved' ? 'อนุมัติแล้ว' :
                         dep.status === 'pending' ? 'รอตรวจสอบ' : 'ปฏิเสธ'}
                      </span>
                    </div>
                    {dep.notes && (
                      <p className="text-xs text-slate-400 mt-1">หมายเหตุ: {dep.notes}</p>
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
