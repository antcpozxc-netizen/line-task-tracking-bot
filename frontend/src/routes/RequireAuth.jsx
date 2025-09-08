// src/routes/RequireAuth.jsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useMe from '../hooks/useMe';

export default function RequireAuth() {
  const { loading, data, error } = useMe();
  const loc = useLocation();

  if (loading) return null; // หรือใส่ Loader
  // ถ้า /api/me ตอบ 401 หรือไม่มี session → ส่งกลับ /login
  if (error || !data?.ok) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <Outlet />;
}
