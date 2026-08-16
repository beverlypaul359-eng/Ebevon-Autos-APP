/* ═══════════════════════════════════════════
   EBEVON — API CLIENT
   Handles all backend communication
═══════════════════════════════════════════ */

const API_BASE = 'http://localhost:4000/api';

/* ── Token management ── */
const TokenStore = {
  get:    ()      => localStorage.getItem('ebevon_token'),
  set:    (t)     => localStorage.setItem('ebevon_token', t),
  clear:  ()      => localStorage.removeItem('ebevon_token'),
  user:   ()      => { try { return JSON.parse(localStorage.getItem('ebevon_user')); } catch { return null; } },
  setUser:(u)     => localStorage.setItem('ebevon_user', JSON.stringify(u)),
  clearUser: ()   => localStorage.removeItem('ebevon_user'),
};

/* ── Core fetch wrapper ── */
async function apiFetch(path, options = {}) {
  const token = TokenStore.get();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Auto-refresh on 401 TOKEN_EXPIRED
  if (resp.status === 401) {
    const data = await resp.json().catch(() => ({}));
    if (data.code === 'TOKEN_EXPIRED') {
      const refreshed = await refreshToken();
      if (refreshed) {
        // Retry once
        headers['Authorization'] = `Bearer ${TokenStore.get()}`;
        const retry = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
        return retry.json();
      }
    }
    TokenStore.clear(); TokenStore.clearUser();
    window.location.href = '/pages/login.html?session=expired';
    return;
  }

  return resp.json();
}

async function refreshToken() {
  try {
    const resp = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await resp.json();
    if (data.success) { TokenStore.set(data.data.accessToken); return true; }
  } catch {}
  return false;
}

/* ════════════════════════════════════════
   AUTH API
════════════════════════════════════════ */
const Auth = {
  signup: (body)  => apiFetch('/auth/signup',  { method: 'POST', body: JSON.stringify(body) }),
  login:  (body)  => apiFetch('/auth/login',   { method: 'POST', body: JSON.stringify(body) }),
  logout: ()      => apiFetch('/auth/logout',  { method: 'POST' }),
  me:     ()      => apiFetch('/auth/me'),
  forgotPassword: (identifier) => apiFetch('/auth/forgot-password', { method:'POST', body: JSON.stringify({ identifier }) }),
  resetPassword:  (body)        => apiFetch('/auth/reset-password',  { method:'POST', body: JSON.stringify(body) }),

  // OAuth — redirect based
  googleLogin:   () => { window.location.href = `${API_BASE}/auth/google`; },
  facebookLogin: () => { window.location.href = `${API_BASE}/auth/facebook`; },

  // Handle OAuth redirect token
  handleOAuthRedirect: () => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    if (token) { TokenStore.set(token); history.replaceState({}, '', window.location.pathname); return true; }
    return false;
  },

  isLoggedIn:  () => !!TokenStore.get(),
  currentUser: () => TokenStore.user(),
  saveSession: (data) => { TokenStore.set(data.accessToken); TokenStore.setUser(data.user); },
  clearSession: () => { TokenStore.clear(); TokenStore.clearUser(); },
};

/* ════════════════════════════════════════
   OTP API
════════════════════════════════════════ */
const OTP = {
  send:   (target, purpose) => apiFetch('/otp/send',   { method: 'POST', body: JSON.stringify({ target, purpose }) }),
  verify: (target, code, purpose) => apiFetch('/otp/verify', { method: 'POST', body: JSON.stringify({ target, code, purpose }) }),
};

/* ════════════════════════════════════════
   PASSKEY API (WebAuthn)
════════════════════════════════════════ */
const Passkey = {
  async startRegistration() {
    const data = await apiFetch('/passkey/register/start', { method: 'POST' });
    if (!data?.success) throw new Error(data?.message || 'Failed to start passkey registration');
    return data.data.options;
  },

  async finishRegistration(attResp, friendlyName) {
    return apiFetch('/passkey/register/finish', {
      method: 'POST',
      body: JSON.stringify({ body: attResp, friendlyName }),
    });
  },

  async startAuthentication(identifier) {
    const data = await apiFetch('/passkey/auth/start', {
      method: 'POST', body: JSON.stringify({ identifier }),
    });
    if (!data?.success) throw new Error(data?.message || 'No passkeys found');
    return { options: data.data.options, userId: data.data.userId };
  },

  async finishAuthentication(userId, authResp) {
    return apiFetch('/passkey/auth/finish', {
      method: 'POST',
      body: JSON.stringify({ userId, body: authResp }),
    });
  },

  list:   ()   => apiFetch('/passkey'),
  remove: (id) => apiFetch(`/passkey/${id}`, { method: 'DELETE' }),
};

/* ════════════════════════════════════════
   KYC API
════════════════════════════════════════ */
const KYC = {
  start:  () => apiFetch('/kyc/start',  { method: 'POST' }),
  status: () => apiFetch('/kyc/status'),
};

/* ════════════════════════════════════════
   CARS API
════════════════════════════════════════ */
const Cars = {
  list:    (params = {}) => apiFetch('/cars?' + new URLSearchParams(params)),
  get:     (id)          => apiFetch(`/cars/${id}`),
  create:  (body)        => apiFetch('/cars', { method: 'POST', body: JSON.stringify(body) }),
  update:  (id, body)    => apiFetch(`/cars/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove:  (id)          => apiFetch(`/cars/${id}`, { method: 'DELETE' }),
  publish: (id, vin)     => apiFetch(`/cars/${id}/publish`, { method: 'POST', body: JSON.stringify({ vin }) }),
  myListings: ()         => apiFetch('/cars/me/listings'),
  save:    (id)          => apiFetch(`/cars/${id}/save`,   { method: 'POST' }),
  unsave:  (id)          => apiFetch(`/cars/${id}/save`,   { method: 'DELETE' }),
  saved:   ()            => apiFetch('/cars/me/saved'),
};

/* ════════════════════════════════════════
   INSPECTION API
════════════════════════════════════════ */
const Inspection = {
  request: (body)  => apiFetch('/inspection', { method: 'POST', body: JSON.stringify(body) }),
  mine:    ()      => apiFetch('/inspection/mine'),
  get:     (id)    => apiFetch(`/inspection/${id}`),
  cancel:  (id)    => apiFetch(`/inspection/${id}/cancel`, { method: 'POST' }),
  // Admin
  all:     (params={}) => apiFetch('/inspection?' + new URLSearchParams(params)),
  schedule:(id, body)  => apiFetch(`/inspection/${id}/schedule`, { method: 'PATCH', body: JSON.stringify(body) }),
  report:  (id, body)  => apiFetch(`/inspection/${id}/report`,   { method: 'PATCH', body: JSON.stringify(body) }),
  stats:   ()          => apiFetch('/inspection/stats/overview'),
};

/* ════════════════════════════════════════
   ESCROW API
════════════════════════════════════════ */
const Escrow = {
  initiate:       (body)          => apiFetch('/escrow', { method: 'POST', body: JSON.stringify(body) }),
  confirm:        (id)            => apiFetch(`/escrow/${id}/confirm`, { method: 'POST' }),
  dispute:        (id, reason)    => apiFetch(`/escrow/${id}/dispute`, { method: 'POST', body: JSON.stringify({ reason }) }),
  get:            (id)            => apiFetch(`/escrow/${id}`),
  mine:           ()              => apiFetch('/escrow/mine'),
  payouts:        ()              => apiFetch('/escrow/payouts'),
  updateDelivery: (id, body)      => apiFetch(`/escrow/${id}/delivery`, { method: 'PATCH', body: JSON.stringify(body) }),
};

/* ════════════════════════════════════════
   USER API
════════════════════════════════════════ */
const User = {
  profile:         ()     => apiFetch('/users/me'),
  update:          (body) => apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword:  (body) => apiFetch('/users/me/password', { method: 'PATCH', body: JSON.stringify(body) }),
  notifications:   ()     => apiFetch('/users/notifications'),
  readNotification:(id)   => apiFetch(`/users/notifications/${id}/read`, { method: 'PATCH' }),
  readAll:         ()     => apiFetch('/users/notifications/read-all', { method: 'PATCH' }),
};

window.EbevonAPI = { Auth, OTP, Passkey, KYC, Cars, Escrow, User, TokenStore };
