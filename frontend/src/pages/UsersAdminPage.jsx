// src/pages/UsersAdminPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, Container, Grid, MenuItem, Stack, TextField,
  Typography, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Tooltip
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import useMe from '../hooks/useMe';
import { listUsers, setUserRole, setUserStatus } from '../api/client';
import TableSortLabel from '@mui/material/TableSortLabel';

const ROLE_RANK = { user: 1, supervisor: 2, admin: 3, developer: 4 };



export default function UsersAdminPage() {
  const { loading, data } = useMe();
  const myRole = (data?.user?.role || '').toLowerCase();

  const [all, setAll] = useState([]);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orderBy, setOrderBy] = useState('updated_at');
  const [order, setOrder] = useState('desc');
  const onSort = (by)=>{ if (orderBy===by) setOrder(order==='asc'?'desc':'asc'); else { setOrderBy(by); setOrder('asc'); } };
  const sortRows = (arr) => {
    const cmp = (a,b,by)=>{
      if (by==='updated_at') return String(a[by]||'').localeCompare(String(b[by]||''));
      return String(a[by]||'').localeCompare(String(b[by]||''), 'th');
    };
    const out = [...arr].sort((a,b)=> (order==='asc'?1:-1) * cmp(a,b,orderBy));
    return out;
  };

  const load = async () => {
    const j = await listUsers();
    setAll(j.users || []);
  };

  useEffect(() => { load().catch(console.error); }, []);

  const rows = useMemo(() => {
    const filtered = all.filter(u => {
      const text = `${u.user_id||''} ${u.username||''} ${u.real_name||''}`.toLowerCase();
      const hitQ = !q || text.includes(q.toLowerCase().trim());
      const hitRole = !roleFilter || String(u.role||'').toLowerCase() === roleFilter;
      const hitStatus = !statusFilter || String(u.status||'') === statusFilter;
      return hitQ && hitRole && hitStatus;
    });
    // sort: role rank สูงก่อน, จากนั้น updated_at ใหม่ก่อน
    return filtered.sort((a, b) => {
      const ra = ROLE_RANK[(String(a.role||'').toLowerCase())] || 0;
      const rb = ROLE_RANK[(String(b.role||'').toLowerCase())] || 0;
      if (rb !== ra) return rb - ra;
      return String(b.updated_at||'').localeCompare(String(a.updated_at||''));
    });
  }, [all, q, roleFilter, statusFilter]);

  const canEditTarget = (targetRole) => {
    const rTarget = ROLE_RANK[(targetRole||'').toLowerCase()] || 0;
    const rMe = ROLE_RANK[(myRole||'').toLowerCase()] || 0;
    // ปิดแก้ไขถ้าเป้าหมาย "ระดับเท่ากันหรือสูงกว่า" ตัวเรา
    return rMe > rTarget;
  };

  const saveRow = async (u) => {
    const roleSel = document.getElementById(`role-${u.user_id}`);
    const statusSel = document.getElementById(`status-${u.user_id}`);
    const newRole = roleSel?.value || u.role;
    const newStatus = statusSel?.value || u.status;

    await setUserRole(u.user_id, newRole);
    await setUserStatus(u.user_id, newStatus);
    await load();
  };

  const exportCsv = () => {
    const header = ['user_id','username','real_name','role','status','updated_at'];
    const lines = rows.map(r => header.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'users.csv'; a.click();
  };

  if (loading) return null;

  return (
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: 'white', mb: 2 }}>Users Admin</Typography>

        <Card elevation={8} sx={{ borderRadius: 4 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="stretch" sx={{ mb: 2 }}>
              <TextField label="ค้นหา (id / username / name)" value={q} onChange={e=>setQ(e.target.value)} fullWidth />
              <TextField select label="Role" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} sx={{ minWidth: 160 }}>
                <MenuItem value="">ทั้งหมด</MenuItem>
                {['user','supervisor','admin','developer'].map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>
              <TextField select label="สถานะ" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} sx={{ minWidth: 160 }}>
                <MenuItem value="">ทั้งหมด</MenuItem>
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Inactive">Inactive</MenuItem>
              </TextField>

              <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
                <Tooltip title="รีเฟรช">
                  <IconButton onClick={load}><RefreshIcon /></IconButton>
                </Tooltip>
                <Tooltip title="ส่งออก CSV">
                  <IconButton onClick={exportCsv}><DownloadIcon /></IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    ['user_id','user_id'],
                    ['username','username'],
                    ['real_name','real_name'],
                    ['role','role'],
                    ['status','status'],
                    ['updated_at','updated_at'],
                  ].map(([label, key])=>(
                    <TableCell key={key} sortDirection={orderBy===key?order:false}>
                      <TableSortLabel active={orderBy===key} direction={orderBy===key?order:'asc'} onClick={()=>onSort(key)}>
                        {label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                  <TableCell align="right" width={140}>action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((u) => {
                  const editable = canEditTarget(u.role);
                  return (
                    <TableRow key={u.user_id} hover>
                      <TableCell>{u.user_id}</TableCell>
                      <TableCell>{u.username}</TableCell>
                      <TableCell>{u.real_name}</TableCell>
                      <TableCell>
                        <TextField
                          id={`role-${u.user_id}`}
                          select
                          size="small"
                          defaultValue={u.role || 'user'}
                          disabled={!editable}
                          sx={{ minWidth: 150 }}
                        >
                          {['user','supervisor','admin','developer'].map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={u.status === 'Active' ? 'Active' : 'Inactive'}
                          color={u.status === 'Active' ? 'success' : 'error'}
                          size="small"
                          sx={{ mr: 1 }}
                        />
                        <TextField
                          id={`status-${u.user_id}`}
                          select
                          size="small"
                          defaultValue={u.status || 'Active'}
                          disabled={!editable}
                          sx={{ minWidth: 140 }}
                        >
                          <MenuItem value="Active">Active</MenuItem>
                          <MenuItem value="Inactive">Inactive</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell>{u.updated_at || ''}</TableCell>
                      <TableCell align="right">
                        <Tooltip title={editable ? 'บันทึก' : 'ห้ามแก้ไขผู้ใช้ระดับเท่ากัน/สูงกว่า'}>
                          <span>
                            <IconButton color="primary" disabled={!editable} onClick={() => saveRow(u)}>
                              <SaveIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Container>
  );
}
