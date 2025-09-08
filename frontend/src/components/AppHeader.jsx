import React from 'react';
import { AppBar, Toolbar, Typography, Box, Avatar, Chip } from '@mui/material';
import useMe from '../hooks/useMe';



export default function AppHeader() {
  const { data } = useMe();
  const uid = data?.session?.uid;
  const name = data?.session?.name || data?.user?.real_name || 'Guest';
  const role = (data?.user?.role || 'user').toLowerCase();
  const picture = data?.session?.picture || '';

  return (
    <AppBar elevation={0} position="static" sx={{
      background: 'linear-gradient(90deg,#1170C3 0%,#0D5FA7 100%)',
      mb: 2
    }}>
      <Toolbar sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, flexGrow: 1 }}>TasksTracker</Typography>
        <Chip size="small" label={role} color={role === 'developer' ? 'secondary' : role === 'admin' || role === 'supervisor' ? 'primary' : 'default'} />
        <Typography variant="body2" sx={{ mr: 1 }}>{name}</Typography>
        <Avatar src={uid ? `/api/profile/${encodeURIComponent(uid)}/photo` : undefined}>
          {(name.trim()[0] || 'U').toUpperCase()}
        </Avatar>

      </Toolbar>
    </AppBar>
  );
}
