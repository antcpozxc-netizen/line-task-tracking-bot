// src/api/client.js

// ------- low-level fetch helpers -------
async function request(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',                 // ส่ง cookie 'sess' เสมอ
    cache: 'no-store',                      // กัน cache
    headers: { Accept: 'application/json', ...(opts.headers || {}) },
    ...opts,
  });

  // ช่วยให้โค้ดฝั่งหน้าเว็บเช็ค session ง่าย ๆ
  if (res.status === 401) return { ok: false }; // ไม่มี session → ไม่ต้อง throw
  if (res.status === 204) return { ok: true };

  // พยายามอ่านเป็น JSON ก่อน ถ้าไม่ใช่ค่อย fallback เป็น text
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

// ------- small util -------
function qs(obj = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') q.append(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ========== API wrappers ==========

// session / me
export const fetchMe        = () => apiGet('/api/me');
export const postOnboarding = (payload) => apiPost('/api/onboarding', payload); // มี endpoint นี้ใน server แล้วเท่านั้น

// ---- Admin – Users (match server.js) ----
// GET /api/admin/users
export const listUsers = () => apiGet('/api/admin/users');

// POST /api/admin/users/role { user_id, role }
export const setUserRole = (user_id, role) =>
  apiPost('/api/admin/users/role', { user_id, role });

// POST /api/admin/users/status { user_id, status }
export const setUserStatus = (user_id, status) =>
  apiPost('/api/admin/users/status', { user_id, status });

// ---- Tasks (match server.js) ----
// GET /api/admin/tasks?assignee_id=&assignee_name=&status=
export const listTasks = (opts = {}) => apiGet('/api/admin/tasks' + qs(opts));

// POST /api/admin/tasks/status { task_id, status }
export const updateTaskStatus = (task_id, status) =>
  apiPost('/api/admin/tasks/status', { task_id, status });

// (ถ้ามีใน server ค่อยเปิดใช้)
// export const listTasksMine = () => apiGet('/api/tasks/mine');
