// src/routes/RequireAuth.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import useMe from '../hooks/useMe';
import { Container, Typography, Button, Box } from '@mui/material';

function NotSignedIn() {
  return (
    <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
      <Typography variant="h6" gutterBottom>
        ยังไม่ได้เข้าสู่ระบบ
      </Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom>
        โปรดพิมพ์ <b>เข้าระบบ หรือ จัดการผู้ใช้</b> ใน LINE OA เพื่อรับลิงก์เข้าสู่ระบบ
      </Typography>
      <Button variant="outlined" onClick={() => window.location.reload()}>
        รีเฟรชหน้านี้
      </Button>
    </Container>
  );
}

export default function RequireAuth() {
  const { loading, data, error } = useMe();

  if (loading) return null;
  if (error || !data?.ok) {
    return <NotSignedIn />;
  }
  return <Outlet />;
}
