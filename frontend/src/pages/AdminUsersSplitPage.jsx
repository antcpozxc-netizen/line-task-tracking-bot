import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Chip, Select, MenuItem, IconButton, Divider, Tooltip,
  Snackbar, Alert
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

import useMe from '../hooks/useMe';
import { listUsers, setUserRole, setUserStatus, deleteUser } from '../api/client';

const ROLE_RANK = { user:1, supervisor:2, admin:3, developer:4 };

const colSx = {
  id:      { width:{ xs:130, sm:220 }, maxWidth:260, whiteSpace:'nowrap' },
  username:{ width:{ xs:120, md:160 }, whiteSpace:'nowrap' },
  name:    { width:{ xs:'34%', md:'38%' }, maxWidth:480, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  role:    { width:{ xs:160, md:200 }, whiteSpace:'nowrap',
            pr:{ xs:3, md:5 } },     // 👉 ระยะขวาของคอลัมน์ role
  status:  { width:{ xs:150, md:180 }, whiteSpace:'nowrap',
            pl:{ xs:2, md:3 } },     // 👉 ระยะซ้ายของคอลัมน์ status
  updated: { width:{ xs:0, md:220 }, display:{ xs:'none', md:'table-cell' }, whiteSpace:'nowrap' },
  action:  { width:{ xs:70, md:90 }, textAlign:'center', whiteSpace:'nowrap' },
};

function roleColor(r) {
  return r === 'developer' ? 'secondary'
       : r === 'admin' || r === 'supervisor' ? 'primary'
       : 'default';
}
const cmp = (a,b,by) => (String(a?.[by] ?? '')).localeCompare(String(b?.[by] ?? ''), 'th');

export default function AdminUsersSplitPage() {
  const { data } = useMe();
  const myRole = (data?.user?.role || 'user').toLowerCase();
  const myRank = ROLE_RANK[myRole] || 0;

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { user_id, name }
  const [snack, setSnack] = useState({ open:false, msg:'', sev:'success' });
  const [refreshedAt, setRefreshedAt] = useState(null);

  // sort state (ใช้ร่วมกันทั้ง 3 ตาราง)
  const [orderBy, setOrderBy] = useState('updated_at');
  const [order, setOrder] = useState('desc');

  const load = async () => {
    setBusy(true);
    try {
      const j = await listUsers();      // { users: [...] }
      setRows(j.users || []);
      setRefreshedAt(new Date());
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { load().catch(console.error); }, []);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a,b)=> (order==='asc'?1:-1) * cmp(a,b,orderBy));
    return arr;
  }, [rows, order, orderBy]);

  const { devRows, mgrRows, userRows } = useMemo(() => {
    const dev = [], mgr = [], usr = [];
    for (const u of sorted) {
      const r = (String(u.role || 'user')).toLowerCase();
      if (r === 'developer') dev.push(u);
      else if (r === 'admin' || r === 'supervisor') mgr.push(u);
      else usr.push(u);
    }
    return { devRows: dev, mgrRows: mgr, userRows: usr };
  }, [sorted]);

  const canEdit = (targetRole) => (ROLE_RANK[targetRole?.toLowerCase()] || 0) < myRank;

  // ---- actions ----
  const doRole = async (u, role) => {
    setBusy(true);
    try {
      await setUserRole(u.user_id, role);
      setSnack({ open:true, msg:'อัปเดตบทบาทแล้ว', sev:'success' });
      await load();
    } catch {
      setSnack({ open:true, msg:'เปลี่ยนบทบาทไม่สำเร็จ', sev:'error' });
      setBusy(false);
    }
  };

  const doStatus = async (u, status) => {
    setBusy(true);
    try {
      await setUserStatus(u.user_id, status);
      setSnack({ open:true, msg:'อัปเดตสถานะแล้ว', sev:'success' });
      await load();
    } catch {
      setSnack({ open:true, msg:'อัปเดตสถานะไม่สำเร็จ', sev:'error' });
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await deleteUser(confirm.user_id);
      setSnack({ open:true, msg:'ตั้งเป็น Inactive แล้ว', sev:'success' });
      setConfirm(null);
      await load();
    } catch {
      setSnack({ open:true, msg:'ลบไม่สำเร็จ', sev:'error' });
      setBusy(false);
    }
  };

  const copyId = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      setSnack({ open:true, msg:'คัดลอก user_id แล้ว', sev:'success' });
    } catch {
      setSnack({ open:true, msg:'คัดลอกไม่สำเร็จ', sev:'error' });
    }
  };

  const onSort = (by)=>{
    if (orderBy===by) setOrder(order==='asc' ? 'desc':'asc');
    else { setOrderBy(by); setOrder('asc'); }
  };

  function IdCell({ id }) {
    return (
      <Box sx={{ display:'flex', alignItems:'center', gap:1, ...colSx.id }}>
        <Box sx={{ overflow:'hidden', textOverflow:'ellipsis' }}>{id}</Box>
        <Tooltip title="คัดลอก user_id">
          <span>
            <IconButton size="small" onClick={()=>copyId(id)}>
              <ContentCopyIcon fontSize="inherit" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    );
  }

  function TableBlock({ title, items }) {
    return (
      <Paper variant="outlined" sx={{ mb: 3, borderRadius: 3, overflow:'hidden' }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
        </Box>
        <Divider />
        <TableContainer sx={{ overflowX:'auto', maxHeight:{ xs:420, md:560 } }}>
          <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={colSx.id}      onClick={()=>onSort('user_id')}    >user_id</TableCell>
                <TableCell sx={colSx.username} onClick={()=>onSort('username')}  >username</TableCell>
                <TableCell sx={colSx.name}     onClick={()=>onSort('real_name')} >name</TableCell>
                <TableCell sx={colSx.role}     >role</TableCell>
                <TableCell sx={colSx.status}   >status</TableCell>
                <TableCell sx={colSx.updated}  onClick={()=>onSort('updated_at')}>updated_at</TableCell>
                <TableCell sx={colSx.action} align="center">action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map(u=>{
                const r = String(u.role||'user').toLowerCase();
                const editable = canEdit(r);
                return (
                  <TableRow key={u.user_id} hover>
                    <TableCell sx={colSx.id}><IdCell id={u.user_id} /></TableCell>
                    <TableCell sx={colSx.username}>{u.username || '-'}</TableCell>
                    <TableCell sx={colSx.name}>{u.real_name || '-'}</TableCell>
                    <TableCell sx={colSx.role}>
                      <Select size="small" value={r} disabled={!editable || busy}
                        sx={{ minWidth: 132 }}  
                        onChange={(e)=>doRole(u, e.target.value)}>
                        <MenuItem value="user">user</MenuItem>
                        <MenuItem value="supervisor">supervisor</MenuItem>
                        <MenuItem value="admin">admin</MenuItem>
                        <MenuItem value="developer">developer</MenuItem>
                      </Select>
                      <Chip size="small" sx={{ ml:1 }} label={r} color={roleColor(r)} />
                    </TableCell>
                    <TableCell sx={colSx.status}>
                      <Select size="small" value={u.status || 'Active'} disabled={!editable || busy}
                        sx={{ minWidth: 120 }}
                        onChange={(e)=>doStatus(u, e.target.value)}>
                        <MenuItem value="Active">Active</MenuItem>
                        <MenuItem value="Inactive">Inactive</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell sx={colSx.updated}>{u.updated_at || ''}</TableCell>
                    <TableCell sx={colSx.action} align="center">
                      <Tooltip title={editable ? 'ลบผู้ใช้' : 'ห้ามลบผู้ใช้ระดับเท่ากัน/สูงกว่า'}>
                        <span>
                          <IconButton color="error" disabled={!editable || busy}
                            onClick={()=>setConfirm({ user_id: u.user_id, name: u.real_name || u.username || u.user_id })}>
                            <DeleteIcon />
                          </IconButton>
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
      {/* header + refresh */}
      <Box sx={{ my:2, display:'flex', alignItems:'center', justifyContent:'space-between', gap:1, flexWrap:'wrap' }}>
        <Typography variant="h5" fontWeight={800}>Administrator management</Typography>
        <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
          {refreshedAt && (
            <Typography variant="caption" color="text.secondary" sx={{ display:{ xs:'none', sm:'block' } }}>
              อัปเดตล่าสุด {new Intl.DateTimeFormat('th-TH',{ dateStyle:'short', timeStyle:'short'}).format(refreshedAt)}
            </Typography>
          )}
          <Tooltip title="Refresh">
            <span><IconButton onClick={load} disabled={busy}><RefreshIcon/></IconButton></span>
          </Tooltip>
        </Box>
      </Box>

      <TableBlock title="Developers"           items={devRows} />
      <TableBlock title="Admins & Supervisors" items={mgrRows} />
      <TableBlock title="Users"                items={userRows} />

      <Dialog open={!!confirm} onClose={()=>setConfirm(null)}>
        <DialogTitle>ยืนยันการลบผู้ใช้</DialogTitle>
        <DialogContent>
          ต้องการลบผู้ใช้ <b>{confirm?.name}</b> ใช่ไหม? (ระบบจะตั้งสถานะเป็น Inactive)
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setConfirm(null)}>ยกเลิก</Button>
          <Button color="error" variant="contained" onClick={doDelete}>ลบ</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={2000} onClose={()=>setSnack(s=>({...s, open:false}))}>
        <Alert severity={snack.sev} sx={{ width:'100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Container>
  );
}
