// src/api/client.js
async function request(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',          // ✅ ส่ง cookie 'sess' ทุกครั้ง
    cache: 'no-store',               // ✅ กัน cache ติด
    headers: { Accept: 'application/json', ...(opts.headers || {}) },
    ...opts,
  });

  // ทำให้เช็ค session ง่ายขึ้น
  if (res.status === 401) return { ok: false };   // ไม่ต้อง throw
  if (res.status === 204) return { ok: true };

  // พยายามอ่านเป็น JSON ถ้าไม่ได้ค่อย fallback เป็น text
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data;
}

export const apiGet  = (path) => request(path);
export const apiPost = (path, body) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

// --------- helpers ----------
function qs(obj = {}) {
  const q = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.append(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ========= APIs =========
export const fetchMe         = () => apiGet('/api/me');
export const postOnboarding  = (payload) => apiPost('/api/onboarding', payload);

// Admin – users
export const listUsers       = () => apiGet('/api/admin/users');
export const setUserRole     = (uid, role)   => apiPost(`/api/admin/users/${uid}/role`,   { role });
export const setUserStatus   = (uid, status) => apiPost(`/api/admin/users/${uid}/status`, { status });

// Tasks
export const listTasksMine   = () => apiGet('/api/tasks/mine');
export const listTasks       = (opts = {}) => apiGet('/api/admin/tasks' + qs(opts));

export const updateTaskStatus = (taskId, status) =>
  apiPost(`/api/tasks/${encodeURIComponent(taskId)}/status`, { status }); // ✅ ใช้ apiPost → มี cookie
