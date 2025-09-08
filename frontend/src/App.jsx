import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppHeader from './components/AppHeader';
import HomePage from './pages/HomePage';
import UsersAdminPage from './pages/UsersAdminPage';
import AdminUsersSplitPage from './pages/AdminUsersSplitPage';
import TasksPage from './pages/TasksPage';
import OnboardingPage from './pages/OnboardingPage';
import RequireAuth from './routes/RequireAuth';

function AppShell({ children }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}

export default function App() {
  return (
    <Routes>
      {/* เปิดเว็บให้เข้าหน้า Home */}
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/login" element={<Navigate to="/app" replace />} />

      {/* ต้องมี session */}
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppShell><HomePage /></AppShell>} />
        <Route path="/tasks" element={<AppShell><TasksPage /></AppShell>} />
        <Route path="/onboarding" element={<AppShell><OnboardingPage /></AppShell>} />
        <Route path="/admin/users" element={<AppShell><UsersAdminPage /></AppShell>} />
        <Route path="/admin/users-split" element={<AppShell><AdminUsersSplitPage /></AppShell>} />
      </Route>

      {/* route อื่น → Home */}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
