'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Chart, registerables } from 'chart.js';
import { Line } from 'react-chartjs-2';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

Chart.register(...registerables);

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const [stats, setStats] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState('7d');
  const mountedRef = useRef(true);
  const loadingRef = useRef(loading); // ref to avoid stale closure in timeout

  // Keep loadingRef in sync with loading state
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    mountedRef.current = true;

    const timeoutId = setTimeout(() => {
      if (mountedRef.current && loadingRef.current) {
        console.warn('⚠️ Homepage data loading timed out — forcing load complete');
        setLoading(false);
        setLoadError(true);
      }
    }, 15000); // 15 second safety timeout

    loadData();

    // Real-time: price/stats every 2 seconds
    const priceInterval = setInterval(loadStatsOnly, 2000);
    // Chart data (heavier) every 5 seconds
    const chartInterval = setInterval(loadHistoryOnly, 5000);

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
      clearInterval(priceInterval);
      clearInterval(chartInterval);
    };
  }, [selectedInterval]);

  async function loadData() {
    try {
      const [statsData, historyData] = await Promise.all([
        api.getMarketStats(),
        api.getPriceHistory(selectedInterval, 60),
      ]);
      if (!mountedRef.current) return;
      setStats(statsData);
      setPriceHistory(historyData.history || []);
      setLoadError(false);
    } catch (err) {
      console.error('Failed to load market data:', err);
      if (!mountedRef.current) return;
      setLoadError(true);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  async function loadStatsOnly() {
    try {
      const statsData = await api.getMarketStats();
      if (mountedRef.current) setStats(statsData);
    } catch (err) { /* silent */ }
  }

  async function loadHistoryOnly() {
    try {
      const historyData = await api.getPriceHistory(selectedInterval, 60);
      if (mountedRef.current) setPriceHistory(historyData.history || []);
    } catch (err) { /* silent */ }
  }

  const chartData = {
    labels: priceHistory.map(p => {
      const d = new Date(p.timestamp);
      return selectedInterval === '1h' 
        ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit' });
    }),
    datasets: [
      {
        label: 'ราคา NVC (THB)',
        data: priceHistory.map(p => p.price),
        borderColor: '#22c55e',
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 400);
          gradient.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
          gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `ราคา: ฿${parseFloat(ctx.parsed.y).toFixed(7)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 10, color: '#94a3b8', font: { size: 10 } },
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
        ticks: {
          color: '#94a3b8',
          font: { size: 11 },
          callback: (val) => '฿' + parseFloat(val).toFixed(7),
        },
      },
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
  };

  const intervals = [
    { key: '1h', label: '1ชม.' },
    { key: '24h', label: '24ชม.' },
    { key: '7d', label: '7วัน' },
    { key: '30d', label: '30วัน' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500">กำลังโหลดข้อมูล...</p>
          <p className="text-xs text-slate-400 mt-2">กรุณารอสักครู่</p>
        </div>
      </div>
    );
  }

  if (loadError && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">ไม่สามารถโหลดข้อมูลได้</h2>
          <p className="text-slate-500 text-sm mb-4">กรุณาลองรีเฟรชหน้าจออีกครั้ง</p>
          <button
            onClick={() => { setLoading(true); setLoadError(false); loadData(); }}
            className="px-6 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium"
          >
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl font-bold">
                N
              </div>
              <div>
                <h1 className="text-2xl font-bold">NovaCoin (NVC)</h1>
                <p className="text-emerald-100 text-sm">เหรียญดิจิทัลแห่งอนาคต</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold">
                ฿{stats?.currentPrice?.toLocaleString('th-TH', { minimumFractionDigits: 7, maximumFractionDigits: 7 })}
              </p>
              <p className={`text-sm mt-1 ${stats?.priceChange24h?.startsWith('+') ? 'text-emerald-200' : 'text-red-200'}`}>
                {stats?.priceChange24h || '+0.00'}% (24ชม.)
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 bg-white/10 backdrop-blur-sm rounded-xl p-4 w-full md:w-auto">
            <div className="text-center px-4">
              <p className="text-emerald-100 text-xs">Market Cap</p>
              <p className="font-bold text-lg">฿{stats?.marketCap ? (stats.marketCap / 1e6).toFixed(1) : '0'}M</p>
            </div>
            <div className="text-center px-4">
              <p className="text-emerald-100 text-xs">ปริมาณ 24ชม.</p>
              <p className="font-bold text-lg">฿{stats?.volume24h ? (stats.volume24h / 1e6).toFixed(1) : '0'}M</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart and Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-800">กราฟราคา NVC</h2>
            <div className="flex space-x-1 bg-slate-100 rounded-lg p-1">
              {intervals.map((inv) => (
                <button
                  key={inv.key}
                  onClick={() => setSelectedInterval(inv.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    selectedInterval === inv.key
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {inv.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[350px]">
            {priceHistory.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                <p>ยังไม่มีข้อมูลกราฟ</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 mb-1">ราคาล่าสุด</h3>
            <p className="text-2xl font-bold text-slate-800">฿{stats?.currentPrice?.toFixed(7)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 mb-1">ผู้ใช้ทั้งหมด</h3>
            <p className="text-2xl font-bold text-slate-800">{stats?.totalUsers?.toLocaleString() || '0'}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 mb-1">ปริมาณการซื้อขายวันนี้</h3>
            <p className="text-2xl font-bold text-slate-800">฿{stats?.volumeToday?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0'}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 shadow-sm text-white">
            <h3 className="text-sm font-medium text-emerald-100 mb-1">พร้อมเริ่มเทรด?</h3>
            <p className="text-sm mb-3 text-emerald-50">สมัครสมาชิกและเริ่มต้นซื้อขาย NovaCoin ได้ทันที</p>
            {isAuthenticated ? (
              <Link href="/buy" className="block w-full text-center bg-white text-emerald-600 font-medium py-2.5 rounded-lg hover:bg-emerald-50 transition-colors">
                เริ่มซื้อขาย
              </Link>
            ) : (
              <Link href="/register" className="block w-full text-center bg-white text-emerald-600 font-medium py-2.5 rounded-lg hover:bg-emerald-50 transition-colors">
                สมัครสมาชิกฟรี
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm text-center">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-slate-800 mb-2">ซื้อขายง่าย</h3>
          <p className="text-sm text-slate-500">ซื้อ-ขาย NovaCoin ได้ทันที ด้วยระบบที่ใช้งานง่าย</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm text-center">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3 className="font-semibold text-slate-800 mb-2">ปลอดภัย 100%</h3>
          <p className="text-sm text-slate-500">ระบบรักษาความปลอดภัยด้วย 2FA และการยืนยันตัวตนหลายชั้น</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm text-center">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-slate-800 mb-2">ฝาก-ถอน สะดวก</h3>
          <p className="text-sm text-slate-500">เติมเงินผ่านบัญชีธนาคาร พร้อมระบบตรวจสอบสลิปอัตโนมัติ</p>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-8 text-sm text-slate-400">
        <p>&copy; 2026 NovaCoin Exchange. สงวนลิขสิทธิ์.</p>
        <p className="mt-1">NovaCoin (NVC) Version 1.0.0 | MVP</p>
      </footer>
    </div>
  );
}
