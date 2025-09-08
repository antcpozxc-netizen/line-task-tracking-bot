import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import theme from './theme';
import AppHeader from './components/AppHeader';

import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import UsersAdminPage from './pages/UsersAdminPage';      // แบบเดิมยังใช้ได้
import AdminUsersSplitPage from './pages/AdminUsersSplitPage'; // แบบแบ่งกลุ่ม
import TasksPage from './pages/TasksPage';
import HomePage from './pages/HomePage';

function AppShell({ children }) {
  return (
    <Box sx={{ minHeight: '100vh', width: '100%', bgcolor: '#f3f7fb' }}>
      <AppHeader />  {/* แถบหัวมี gradient อยู่แล้ว */}
      {/* เนื้อหาแต่ละหน้าอยู่ในกรอบกลาง ความกว้างอ่านง่าย */}
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 }, py: 3 }}>
        {children}
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/login" element={<AppShell><LoginPage /></AppShell>} />
          <Route path="/onboarding" element={<AppShell><OnboardingPage /></AppShell>} />
          <Route path="/admin/users" element={<AppShell><UsersAdminPage /></AppShell>} />
          <Route path="/admin/users-split" element={<AppShell><AdminUsersSplitPage /></AppShell>} />
          <Route path="/tasks" element={<AppShell><TasksPage /></AppShell>} />
          {/* ✅ /app มีหน้าบ้านจริงแล้ว */}
          <Route path="/app" element={<AppShell><HomePage /></AppShell>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
