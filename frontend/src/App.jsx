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
import RequireAuth from './routes/RequireAuth';


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
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<AppShell><LoginPage /></AppShell>} />

          {/* ต้องล็อกอิน */}
          <Route element={<RequireAuth />}>
            <Route path="/onboarding" element={<AppShell><OnboardingPage /></AppShell>} />
            <Route path="/admin/users" element={<AppShell><UsersAdminPage /></AppShell>} />
            <Route path="/admin/users-split" element={<AppShell><AdminUsersSplitPage /></AppShell>} />
            <Route path="/tasks" element={<AppShell><TasksPage /></AppShell>} />
            <Route path="/app" element={<AppShell><HomePage /></AppShell>} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
