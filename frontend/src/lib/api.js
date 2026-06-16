const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = null;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('nvc_token');
    }
  }

  setToken(token) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('nvc_token', token);
      } else {
        localStorage.removeItem('nvc_token');
      }
    }
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Don't set Content-Type for FormData
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const config = {
      ...options,
      headers,
    };

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'เกิดข้อผิดพลาด');
    }

    return data;
  }

  // Auth
  register(email, password, full_name, phone) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name, phone }),
    });
  }

  verifyEmail(email, code) {
    return this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  }

  login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  verify2fa(tempToken, code) {
    return this.request('/auth/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({ tempToken, code }),
    });
  }

  getMe() {
    return this.request('/auth/me');
  }

  setup2fa() {
    return this.request('/auth/setup-2fa', { method: 'POST' });
  }

  enable2fa(code) {
    return this.request('/auth/enable-2fa', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  disable2fa(code) {
    return this.request('/auth/disable-2fa', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  sendOtp(email, type) {
    return this.request('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email, type }),
    });
  }

  logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  // Google Auth
  getGoogleAuthUrl() {
    return this.request('/auth/google/url');
  }

  verifyGoogleToken(token) {
    return this.request('/auth/google/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  // Wallet
  getWallets() {
    return this.request('/wallet');
  }

  getTransactions(page = 1) {
    return this.request(`/wallet/transactions?page=${page}`);
  }

  // Deposit
  getDepositInfo() {
    return this.request('/deposit/info');
  }

  createDeposit(formData) {
    return this.request('/deposit/create', {
      method: 'POST',
      body: formData,
    });
  }

  getDeposits() {
    return this.request('/deposit/list');
  }

  getDeposit(id) {
    return this.request(`/deposit/${id}`);
  }

  // Withdrawal
  getWithdrawInfo() {
    return this.request('/withdraw/info');
  }

  createWithdrawal(amount, bank_name, bank_account, account_name) {
    return this.request('/withdraw/create', {
      method: 'POST',
      body: JSON.stringify({ amount, bank_name, bank_account, account_name }),
    });
  }

  getWithdrawals() {
    return this.request('/withdraw/list');
  }

  getWithdrawal(id) {
    return this.request(`/withdraw/${id}`);
  }

  // Admin: Withdrawals
  getAdminWithdrawals(status = 'all', page = 1) {
    return this.request(`/admin/withdrawals?status=${status}&page=${page}`);
  }

  approveWithdrawal(id) {
    return this.request(`/admin/withdrawals/${id}/approve`, {
      method: 'POST',
    });
  }

  rejectWithdrawal(id, notes = '') {
    return this.request(`/admin/withdrawals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  // Trading
  placeOrder(type, amount, price) {
    return this.request('/trading/place-order', {
      method: 'POST',
      body: JSON.stringify({ type, amount, price }),
    });
  }

  getOrders() {
    return this.request('/trading/orders');
  }

  cancelOrder(id) {
    return this.request(`/trading/cancel-order/${id}`, {
      method: 'DELETE',
    });
  }

  getOrderBook() {
    return this.request('/trading/orderbook');
  }

  getTrades() {
    return this.request('/trading/trades');
  }

  getPriceHistory(interval = '7d', limit = 100) {
    return this.request(`/trading/price-history?interval=${interval}&limit=${limit}`);
  }

  getMarketStats() {
    return this.request('/trading/stats');
  }

  // Admin
  getAdminDashboard() {
    return this.request('/admin/dashboard');
  }

  getUsers(page = 1) {
    return this.request(`/admin/users?page=${page}`);
  }

  getDeposits(status = 'all', page = 1) {
    return this.request(`/admin/deposits?status=${status}&page=${page}`);
  }

  approveDeposit(id) {
    return this.request(`/admin/deposits/${id}/approve`, {
      method: 'POST',
    });
  }

  rejectDeposit(id, notes = '') {
    return this.request(`/admin/deposits/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  banUser(id) {
    return this.request(`/admin/users/${id}/ban`, {
      method: 'POST',
    });
  }

  getAdminOrders() {
    return this.request('/admin/orders');
  }

  getAdminTrades() {
    return this.request('/admin/trades');
  }

  updateSetting(key, value) {
    return this.request('/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
  }

  getSettings() {
    return this.request('/admin/settings');
  }

  // Get slip image data (base64) for a deposit
  getDepositSlip(depositId) {
    return this.request(`/deposit/${depositId}/slip`);
  }

  // Bank QR Code management
  uploadDepositQr(formData) {
    return this.request('/admin/deposit/qrcode', {
      method: 'POST',
      body: formData,
    });
  }

  deleteDepositQr() {
    return this.request('/admin/deposit/qrcode', {
      method: 'DELETE',
    });
  }

  // === ADMIN SECURITY ENHANCEMENTS ===

  // Admin PIN verification for sensitive actions
  verifyAdminPin(pin) {
    return this.request('/admin/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  }

  // Admin adjust user wallet (add/remove funds)
  adjustWallet(userId, currency, amount, reason, adminPin) {
    return this.request('/admin/wallet/adjust', {
      method: 'POST',
      body: JSON.stringify({ userId, currency, amount, reason }),
      headers: {
        'X-Admin-Pin': adminPin,
      },
    });
  }

  // Get wallet adjustment audit logs for a user
  getWalletAuditLogs(userId) {
    return this.request(`/admin/wallet/audit/${userId}`);
  }
}

const api = new ApiClient();
export default api;
