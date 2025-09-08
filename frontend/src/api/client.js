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

export const apiDelete = (path) => request(path, { method: 'DELETE' });


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
export const postOnboarding = (payload) => apiPost('/api/onboarding', payload); // ใช้เมื่อมี endpoint นี้ใน server

// ---- Admin – Users (match server.js) ----
export const listUsers = () => apiGet('/api/admin/users');

// เปลี่ยนบทบาทผู้ใช้  (POST /api/admin/users/role  body: { user_id, role })
export const setUserRole = (user_id, role) =>
  apiPost('/api/admin/users/role', { user_id, role });

// เปลี่ยนสถานะผู้ใช้  (POST /api/admin/users/status  body: { user_id, status })
export const setUserStatus = (user_id, status) =>
  apiPost('/api/admin/users/status', { user_id, status });

// ลบผู้ใช้ (soft delete → Inactive)  (DELETE /api/admin/users/:user_id)
export const deleteUser = (user_id) =>
  apiDelete(`/api/admin/users/${encodeURIComponent(user_id)}`);

// ---- Tasks (match server.js) ----
// ดึงงาน (GET /api/admin/tasks?assignee_id=&assignee_name=&status=)
export const listTasks = (opts = {}) => apiGet('/api/admin/tasks' + qs(opts));

// เปลี่ยนสถานะงาน (POST /api/admin/tasks/status  body: { task_id, status })
export const updateTaskStatus = (task_id, status) =>
  apiPost('/api/admin/tasks/status', { task_id, status });

// (ถ้ามีใน server ค่อยเปิดใช้)
// export const listTasksMine = () => apiGet('/api/tasks/mine');

// Export CSV (ดาวน์โหลดไฟล์โดยตรง)
export const exportTasksCsv = (opts = {}) => {
  const url = '/api/admin/tasks/export' + qs(opts);
  window.location.href = url; // ให้เบราว์เซอร์ดาวน์โหลดไฟล์
};
