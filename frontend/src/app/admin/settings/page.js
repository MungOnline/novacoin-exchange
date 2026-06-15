'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../lib/api';

export default function AdminSettings() {
  const { isAdmin, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [qrUploading, setQrUploading] = useState(false);
  const [qrDeleting, setQrDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push('/');
      return;
    }
    if (isAuthenticated && isAdmin) {
      loadSettings();
    }
  }, [isAuthenticated, isAdmin, authLoading]);

  async function loadSettings() {
    try {
      const data = await api.getSettings();
      setSettings(data.settings || {});
    } catch (err) {
      console.error('Load settings error:', err);
    } finally {
      setLoading(false);
    }
  }

  const showMessage = (text, type = 'success') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  };

  const handleSave = async (key, value) => {
    setSaving(key);
    setMessage('');
    try {
      await api.updateSetting(key, value);
      showMessage(`อัปเดต "${key}" สำเร็จ`);
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch (err) {
      showMessage(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    } finally {
      setSaving(null);
    }
  };

  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      showMessage('ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 2MB)', 'error');
      return;
    }

    setQrUploading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('qrcode', file);
      const res = await api.uploadDepositQr(formData);
      showMessage('อัปโหลด QR Code สำเร็จ');
      // Update local state with the new QR path
      setSettings(prev => ({ ...prev, deposit_qr_code: res.path }));
      // Refresh settings to get the exact path
      await loadSettings();
    } catch (err) {
      showMessage(`อัปโหลด QR Code ล้มเหลว: ${err.message}`, 'error');
    } finally {
      setQrUploading(false);
      e.target.value = '';
    }
  };

  const handleQrDelete = async () => {
    if (!confirm('ต้องการลบ QR Code ใช่หรือไม่?')) return;

    setQrDeleting(true);
    setMessage('');
    try {
      await api.deleteDepositQr();
      showMessage('ลบ QR Code แล้ว');
      setSettings(prev => ({ ...prev, deposit_qr_code: '' }));
    } catch (err) {
      showMessage(`ลบ QR Code ล้มเหลว: ${err.message}`, 'error');
    } finally {
      setQrDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const generalFields = [
    { key: 'nvc_price', label: 'ราคา NVC (THB)', type: 'number', step: '0.0001' },
    { key: 'nvc_price_change_24h', label: 'เปอร์เซ็นต์เปลี่ยน 24ชม.', type: 'text', placeholder: '+5.23' },
    { key: 'market_cap', label: 'Market Cap (THB)', type: 'number', step: '1' },
    { key: 'volume_24h', label: 'Volume 24ชม. (THB)', type: 'number', step: '1' },
  ];

  const bankFields = [
    { key: 'deposit_bank_name', label: 'ชื่อธนาคาร', type: 'text', placeholder: 'เช่น ธนาคารกรุงเทพ' },
    { key: 'deposit_account_number', label: 'เลขที่บัญชี', type: 'text', placeholder: 'เช่น 123-4-56789-0' },
    { key: 'deposit_account_name', label: 'ชื่อบัญชี', type: 'text', placeholder: 'เช่น บริษัท โนวา คอยน์ จำกัด' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ตั้งค่าระบบ</h1>
          <p className="text-slate-500">ปรับแต่งการตั้งค่าต่างๆ ของระบบ</p>
        </div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">← กลับ</Link>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${
          messageType === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {message}
        </div>
      )}

      {/* Bank Settings Card */}
      <div className="bg-white rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">ตั้งค่าบัญชีธนาคาร</h2>
              <p className="text-xs text-slate-400">ข้อมูลบัญชีที่จะแสดงให้ผู้ใช้โอนเงินมา</p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {bankFields.map((field) => (
            <div key={field.key} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div>
                <label className="text-sm font-medium text-slate-700">{field.label}</label>
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type={field.type || 'text'}
                  value={settings[field.key] || ''}
                  step={field.step}
                  placeholder={field.placeholder}
                  onChange={(e) => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-56 focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={() => handleSave(field.key, settings[field.key])}
                  disabled={saving === field.key}
                  className="px-4 py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {saving === field.key ? (
                    <span className="flex items-center gap-1">
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      กำลังบันทึก
                    </span>
                  ) : 'บันทึก'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* QR Code Section */}
        <div className="border-t border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium text-slate-700">QR Code สำหรับโอนเงิน</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                อัปโหลด QR Code ที่สแกนแล้วไปยังบัญชีธนาคารนี้โดยตรง (รูปภาพ .png/.jpg สูงสุด 2MB)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* QR Preview */}
            <div className="w-32 h-32 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {settings.deposit_qr_code ? (
                <img
                  src={settings.deposit_qr_code}
                  alt="QR Code ปัจจุบัน"
                  className="w-full h-full object-contain p-2"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              {!settings.deposit_qr_code && (
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto text-slate-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  <p className="text-xs text-slate-400">ยังไม่มี QR Code</p>
                </div>
              )}
              {/* Fallback shown when image fails */}
              <div className="hidden w-full h-full items-center justify-center bg-red-50">
                <p className="text-xs text-red-400">รูปภาพเสีย</p>
              </div>
            </div>

            {/* Upload/Delete Buttons */}
            <div className="space-y-3">
              <div>
                <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ${
                  qrUploading
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {qrUploading ? 'กำลังอัปโหลด...' : 'อัปโหลด QR Code'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={handleQrUpload}
                    disabled={qrUploading}
                    className="hidden"
                  />
                </label>
              </div>

              {settings.deposit_qr_code && (
                <button
                  onClick={handleQrDelete}
                  disabled={qrDeleting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-all disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {qrDeleting ? 'กำลังลบ...' : 'ลบ QR Code'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* General Settings Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">การตั้งค่าทั่วไป</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {generalFields.map((field) => (
            <div key={field.key} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div>
                <label className="text-sm font-medium text-slate-700">{field.label}</label>
                <p className="text-xs text-slate-400 mt-0.5">key: {field.key}</p>
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type={field.type || 'text'}
                  value={settings[field.key] || ''}
                  step={field.step}
                  placeholder={field.placeholder}
                  onChange={(e) => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={() => handleSave(field.key, settings[field.key])}
                  disabled={saving === field.key}
                  className="px-4 py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {saving === field.key ? (
                    <span className="flex items-center gap-1">
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </span>
                  ) : 'บันทึก'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-4">ข้อมูลเกี่ยวกับราคา NVC</h2>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-700">
            ⚠️ ระบบราคาปัจจุบันเป็นแบบ Order Book (ราคามาจากคำสั่งซื้อขายจริง)
            ถ้าต้องการเปลี่ยนเป็นแบบ Simulated ให้แก้ไข Trading Engine
          </p>
        </div>
      </div>
    </div>
  );
}
