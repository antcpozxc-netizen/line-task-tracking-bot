// src/pages/LoginPage.jsx
import React, { useEffect } from 'react';
import { Box, Button, Card, CardContent, Container, Stack, Typography } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import { useNavigate } from 'react-router-dom';
import useMe from '../hooks/useMe';

export default function LoginPage() {
  const me = useMe();
  const navigate = useNavigate();

  // ✅ ถ้า login แล้ว ไม่ให้ค้างอยู่หน้าล็อกอิน
  useEffect(() => {
    if (!me.loading && me.data?.ok) {
      navigate('/app', { replace: true });
    }
  }, [me.loading, me.data, navigate]);

  const handleLogin = () => {
    window.location.href = '/auth/line/start';
  };

  return (
      <Container maxWidth="sm">
        <Card elevation={8} sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: 4 }}>
            <Stack spacing={2} alignItems="center" textAlign="center">
              {/* โลโก้/หัวข้อ */}
              <Box sx={{ width: 96, height: 96, borderRadius: '50%', bgcolor: '#e9f3ff', display: 'grid', placeItems: 'center', fontSize: 40 }}>
                ✅
              </Box>
              <Typography variant="h4" color="primary">TasksTracker</Typography>
              <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                เข้าสู่ระบบด้วย LINE เพื่อจัดการงานและผู้ใช้ในระบบ Tasks Tracking
              </Typography>
              <Button
                size="large"
                variant="contained"
                startIcon={<LoginIcon />}
                onClick={handleLogin}
                sx={{ px: 4, py: 1.5, borderRadius: 999 }}
              >
                Login with LINE
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
  );
}
