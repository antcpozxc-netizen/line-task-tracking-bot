// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import theme from './theme';
import AppHeader from './components/AppHeader';
import useMe from './hooks/useMe';

import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import UsersAdminPage from './pages/UsersAdminPage';
import AdminUsersSplitPage from './pages/AdminUsersSplitPage';
import TasksPage from './pages/TasksPage';
import HomePage from './pages/HomePage';

function AppShell({ children }) {
  return (
    <Box sx={{ minHeight: '100vh', width: '100%', bgcolor: '#f3f7fb' }}>
      <AppHeader />
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 }, py: 3 }}>
        {children}
      </Box>
    </Box>
  );
}

// ให้เฉพาะผู้ที่ล็อกอินแล้วเข้าได้
function Protected({ children }) {
  const me = useMe();
  if (me.loading) {
    return (
      <Box sx={{ display:'grid', placeItems:'center', height:'40vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  return me.data?.ok ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          {/* เริ่มที่ /login */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* หน้า Login เปิดเสมอ */}
          <Route path="/login" element={<AppShell><LoginPage /></AppShell>} />

          {/* เพจที่ต้องล็อกอิน */}
          <Route path="/app" element={<Protected><AppShell><HomePage /></AppShell></Protected>} />
          <Route path="/onboarding" element={<Protected><AppShell><OnboardingPage /></AppShell></Protected>} />
          <Route path="/admin/users" element={<Protected><AppShell><UsersAdminPage /></AppShell></Protected>} />
          <Route path="/admin/users-split" element={<Protected><AppShell><AdminUsersSplitPage /></AppShell></Protected>} />
          <Route path="/tasks" element={<Protected><AppShell><TasksPage /></AppShell></Protected>} />

          {/* ไม่ตรง route → กลับไป login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
