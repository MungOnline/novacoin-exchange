'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';

export default function SellPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const [wallets, setWallets] = useState(null);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (isAuthenticated) {
      loadData();
      const refreshInterval = setInterval(loadData, 2000);
      return () => clearInterval(refreshInterval);
    }
  }, [isAuthenticated, authLoading]);

  async function loadData() {
    try {
      const [walletData, statsData, ordersData, orderBookData] = await Promise.all([
        api.getWallets(),
        api.getMarketStats(),
        api.getOrders(),
        api.getOrderBook(),
      ]);
      setWallets(walletData.wallets);
      setStats(statsData);
      setOrders(ordersData.orders || []);
      setOrderBook(orderBookData);
    } catch (err) {
      console.error('Load sell page error:', err);
    } finally {
      setLoading(false);
    }
  }

  const marketPrice = stats?.currentPrice ? parseFloat(stats.currentPrice) : 0;

  const handleAmountChange = (val) => {
    setAmount(val);
    const amt = parseFloat(val);
    if (!isNaN(amt) && marketPrice > 0) {
      setTotal((amt * marketPrice).toFixed(2));
    } else {
      setTotal('');
    }
  };

  const handleTotalChange = (val) => {
    setTotal(val);
    const tot = parseFloat(val);
    if (!isNaN(tot) && marketPrice > 0) {
      setAmount((tot / marketPrice).toFixed(4));
    } else {
      setAmount('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    const submitPrice = marketPrice.toString();

    try {
      const result = await api.placeOrder('sell', amount, submitPrice);
      setMessage(result.message || `ขาย NVC สำเร็จ! รับ ${(parseFloat(amount) * marketPrice).toFixed(2)} THB`);
      setAmount('');
      setTotal('');
      const [walletData, ordersData] = await Promise.all([
        api.getWallets(),
        api.getOrders(),
      ]);
      setWallets(walletData.wallets);
      setOrders(ordersData.orders || []);
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

  const nvcWallet = wallets?.find(w => w.currency === 'NVC');
  const availableNVC = nvcWallet ? nvcWallet.balance - nvcWallet.locked : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">ขาย NVC</h1>
        <p className="text-slate-500">ขายเหรียญ NovaCoin เป็นเงิน THB</p>
      </div>

      {message && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">{message}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sell Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">คำสั่งขาย</h2>
            </div>
            <div className="p-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ราคาต่อหน่วย (THB)</label>
                  <div className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50 rounded-lg text-slate-700 font-medium">
                    ฿{stats?.currentPrice ? parseFloat(stats.currentPrice).toFixed(7) : '-'}
                    <span className="text-xs text-slate-400 ml-2">(ราคาตลาด)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">จำนวน NVC</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      step="0.01"
                      min="10"
                      placeholder="10"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                      required
                    />
                    <p className="text-xs text-slate-400 mt-1">ขั้นต่ำ 10 NVC</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">รวมเป็นเงิน (THB)</label>
                    <input
                      type="number"
                      value={total}
                      onChange={(e) => handleTotalChange(e.target.value)}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                      required
                    />
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">ยอดคงเหลือ (NVC)</span>
                    <span className="font-medium text-slate-800">{availableNVC.toLocaleString('th-TH', { minimumFractionDigits: 2 })} NVC</span>
                  </div>
                  {amount && parseFloat(amount) > availableNVC && (
                    <p className="text-xs text-red-500 mt-1">จำนวน NVC ไม่เพียงพอ</p>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !amount || marketPrice <= 0 || (amount && parseFloat(amount) > availableNVC)}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-3 rounded-lg font-medium hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                >
                  {submitting ? 'กำลังดำเนินการ...' : `ขาย NVC${amount ? ` ${parseFloat(amount).toFixed(4)}` : ''}`}
                </button>
              </form>
            </div>
          </div>

          {/* My Sell Orders */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mt-6">
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">คำสั่งขายของฉัน</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {orders.filter(o => o.type === 'sell').length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <p className="text-sm">ยังไม่มีคำสั่งขาย</p>
                </div>
              ) : (
                orders.filter(o => o.type === 'sell').map((order, i) => (
                  <div key={order.id || i} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          ขาย {order.amount} NVC @ ฿{order.price}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(order.created_at).toLocaleString('th-TH')}
                          {order.filled > 0 && ` | ขายแล้ว ${order.filled} NVC`}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          order.status === 'filled' ? 'bg-emerald-100 text-emerald-700' :
                          order.status === 'open' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {order.status === 'filled' ? 'สำเร็จ' :
                           order.status === 'open' ? 'รอจับคู่' :
                           order.status === 'partial' ? 'บางส่วน' : 'ยกเลิก'}
                        </span>
                        {order.status !== 'filled' && order.status !== 'cancelled' && (
                          <button
                            onClick={async () => {
                              try {
                                await api.cancelOrder(order.id);
                                const ordersData = await api.getOrders();
                                setOrders(ordersData.orders || []);
                              } catch (err) {
                                setError(err.message);
                              }
                            }}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            ยกเลิก
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">ราคาตลาด</h3>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-slate-800">
                ฿{stats?.currentPrice?.toLocaleString('th-TH', { minimumFractionDigits: 7, maximumFractionDigits: 7 })}
              </p>
              <div className="flex justify-between mt-2">
                <span className="text-sm text-slate-500">NVC คงเหลือ</span>
                <span className="text-sm font-medium">{availableNVC.toFixed(2)} NVC</span>
              </div>
            </div>
          </div>

          <Link href="/buy" className="block w-full text-center bg-emerald-50 text-emerald-600 py-3 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors border border-emerald-200">
            ← ไปหน้าซื้อ NVC
          </Link>
        </div>
      </div>
    </div>
  );
}
