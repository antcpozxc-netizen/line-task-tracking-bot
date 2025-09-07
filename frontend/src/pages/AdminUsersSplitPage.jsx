import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Stack, Chip, Select, MenuItem, IconButton, Divider, Tooltip
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import useMe from '../hooks/useMe';
import { listUsers, setUserRole, setUserStatus } from '../api/client';

const ROLE_RANK = { user:1, supervisor:2, admin:3, developer:4 };

function roleColor(r) {
  return r === 'developer' ? 'secondary'
       : r === 'admin' || r === 'supervisor' ? 'primary'
       : 'default';
}

export default function AdminUsersSplitPage() {
  const { data } = useMe();
  const myRole = (data?.user?.role || 'user').toLowerCase();
  const myRank = ROLE_RANK[myRole] || 0;

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const j = await listUsers();            // { users: [...] }
    setRows(j.users || []);
  };
  useEffect(() => { load().catch(console.error); }, []);

  const { devRows, mgrRows, userRows } = useMemo(() => {
    const dev = [], mgr = [], usr = [];
    for (const u of rows) {
      const r = (String(u.role || 'user')).toLowerCase();
      if (r === 'developer') dev.push(u);
      else if (r === 'admin' || r === 'supervisor') mgr.push(u);
      else usr.push(u);
    }
    return { devRows: dev, mgrRows: mgr, userRows: usr };
  }, [rows]);

  const canEdit = (targetRole) => (ROLE_RANK[targetRole?.toLowerCase()] || 0) < myRank;

  const save = async (u) => {
    setBusy(true);
    const roleSel = document.getElementById(`role-${u.user_id}`);
    const statusSel = document.getElementById(`status-${u.user_id}`);
    const newRole = roleSel?.value || u.role;
    const newStatus = statusSel?.value || u.status;
    await setUserRole(u.user_id, newRole);
    await setUserStatus(u.user_id, newStatus);
    await load();
    setBusy(false);
  };

  function TableBlock({ title, items }) {
    return (
      <Paper variant="outlined" sx={{ mb: 3, borderRadius: 3 }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
        </Box>
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>user_id</TableCell>
                <TableCell>username</TableCell>
                <TableCell>name</TableCell>
                <TableCell>role</TableCell>
                <TableCell>status</TableCell>
                <TableCell>updated_at</TableCell>
                <TableCell align="right" width={120}>action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map(u=>{
                const r = String(u.role||'user').toLowerCase();
                const editable = canEdit(r);
                return (
                  <TableRow key={u.user_id} hover>
                    <TableCell>{u.user_id}</TableCell>
                    <TableCell>{u.username}</TableCell>
                    <TableCell>{u.real_name}</TableCell>
                    <TableCell>
                      <Select id={`role-${u.user_id}`} size="small" defaultValue={r} disabled={!editable}>
                        <MenuItem value="user">user</MenuItem>
                        <MenuItem value="supervisor">supervisor</MenuItem>
                        <MenuItem value="admin">admin</MenuItem>
                        <MenuItem value="developer">developer</MenuItem>
                      </Select>
                      <Chip size="small" sx={{ ml:1 }} label={r} color={roleColor(r)} />
                    </TableCell>
                    <TableCell>
                      <Select id={`status-${u.user_id}`} size="small" defaultValue={u.status || 'Active'} disabled={!editable}>
                        <MenuItem value="Active">Active</MenuItem>
                        <MenuItem value="Inactive">Inactive</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell>{u.updated_at || ''}</TableCell>
                    <TableCell align="right">
                      <Tooltip title={editable ? 'บันทึก' : 'ห้ามแก้ผู้ใช้ระดับเท่ากัน/สูงกว่า'}>
                        <span>
                          <IconButton onClick={()=>save(u)} disabled={!editable || busy}><SaveIcon /></IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {items.length===0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py:3, color:'text.secondary' }}>No users</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  }

  return (
    <Container sx={{ pb: 6 }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>Administrator management</Typography>
      <TableBlock title="Developers"     items={devRows} />
      <TableBlock title="Admins & Supervisors" items={mgrRows} />
      <TableBlock title="Users"          items={userRows} />
    </Container>
  );
}
