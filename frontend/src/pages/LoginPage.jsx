// src/pages/LoginPage.jsx
import React from 'react';
import { Box, Button, Card, CardContent, Container, Stack, Typography } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';

export default function LoginPage() {
  const handleLogin = () => {
    // ส่งไป backend ให้เริ่ม LINE Login
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
                เข้าสู่ระบบด้วย LINE เพื่อจัดการงานและผู้ใช้ในระบบ VPC Tasks Tracking
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
