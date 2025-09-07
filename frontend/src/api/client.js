// src/api/client.js
export async function apiGet(path) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function apiPost(path, data) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data || {})
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// เพิ่ม helper ทำ query string
function qs(obj = {}) {
  const q = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.append(k, v) });
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** GET /api/me (ใช้เช็ค session + ข้อมูล user) */
export const fetchMe = () => apiGet('/api/me');

/** POST /api/onboarding */
export const postOnboarding = (payload) => apiPost('/api/onboarding', payload);

/** Admin – users */
export const listUsers = () => apiGet('/api/admin/users');
export const setUserRole = (uid, role) => apiPost(`/api/admin/users/${uid}/role`, { role });
export const setUserStatus = (uid, status) => apiPost(`/api/admin/users/${uid}/status`, { status });
export const listTasksMine = () => apiGet('/api/tasks/mine');
export const listTasks = (opts = {}) => apiGet('/api/admin/tasks' + qs(opts));

export const updateTaskStatus = (taskId, status) =>
  fetch(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  }).then(r => r.json());