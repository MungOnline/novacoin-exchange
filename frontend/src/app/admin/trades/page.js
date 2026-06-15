'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../lib/api';

export default function AdminTrades() {
  const { isAdmin, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [trades, setTrades] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('trades');
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
      const [tradesData, ordersData] = await Promise.all([
        api.getAdminTrades(),
        api.getAdminOrders(),
      ]);
      setTrades(tradesData.trades || []);
      setOrders(ordersData.orders || []);
    } catch (err) {
      console.error('Load trades error:', err);
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">รายการซื้อขาย</h1>
          <p className="text-slate-500">ดูประวัติการซื้อขายและคำสั่งซื้อขายทั้งหมด</p>
        </div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">← กลับ</Link>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('trades')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            tab === 'trades' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'
          }`}
        >
          รายการเทรด
        </button>
        <button
          onClick={() => setTab('orders')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            tab === 'orders' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'
          }`}
        >
          คำสั่งซื้อขาย
        </button>
      </div>

      {/* Trades */}
      {tab === 'trades' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">ผู้ซื้อ</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">ผู้ขาย</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">จำนวน NVC</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">ราคา</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">รวม (THB)</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">เวลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trades.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">ยังไม่มีรายการเทรด</td></tr>
                ) : (
                  trades.map((t, i) => (
                    <tr key={t.id || i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-emerald-600 font-medium">{t.buyer_email}</td>
                      <td className="px-4 py-3 text-sm text-red-600 font-medium">{t.seller_email}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium">{t.amount}</td>
                      <td className="px-4 py-3 text-right text-sm">฿{t.price}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium">฿{t.total?.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-center text-sm text-slate-500">{new Date(t.created_at).toLocaleString('th-TH')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Orders */}
      {tab === 'orders' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">ผู้ใช้</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">ประเภท</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">จำนวน</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">ราคา</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">เติมแล้ว</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">สถานะ</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">เวลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">ยังไม่มีคำสั่งซื้อขาย</td></tr>
                ) : (
                  orders.map((o, i) => (
                    <tr key={o.id || i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm">{o.email}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          o.type === 'buy' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {o.type === 'buy' ? 'ซื้อ' : 'ขาย'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">{o.amount}</td>
                      <td className="px-4 py-3 text-right text-sm">฿{o.price}</td>
                      <td className="px-4 py-3 text-right text-sm">{o.filled}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          o.status === 'filled' ? 'bg-emerald-100 text-emerald-700' :
                          o.status === 'open' ? 'bg-blue-100 text-blue-700' :
                          o.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {o.status === 'filled' ? 'สำเร็จ' :
                           o.status === 'open' ? 'เปิด' :
                           o.status === 'partial' ? 'บางส่วน' : 'ยกเลิก'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-slate-500">{new Date(o.created_at).toLocaleString('th-TH')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
