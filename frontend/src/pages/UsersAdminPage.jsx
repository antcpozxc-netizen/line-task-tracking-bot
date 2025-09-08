// src/pages/UsersAdminPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, Select, MenuItem, IconButton, Tooltip, TableContainer,
  Snackbar, Alert
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import TableSortLabel from '@mui/material/TableSortLabel';
import { listUsers, setUserRole, setUserStatus, deleteUser } from '../api/client';

const colSx = {
  id:      { width:{ xs:130, sm:220 }, maxWidth:260, whiteSpace:'nowrap' },
  username:{ width:{ xs:120, md:160 }, whiteSpace:'nowrap' },
  name:    {
    width:{ xs:'34%', md:'38%' }, maxWidth:480,
    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
  },
  role:    { width:{ xs:140, md:170 }, whiteSpace:'nowrap' },
  status:  { width:{ xs:130, md:150 }, whiteSpace:'nowrap' },
  updated: { width:{ xs:0, md:220 }, display:{ xs:'none', md:'table-cell' }, whiteSpace:'nowrap' },
  action:  { width:{ xs:70, md:80 }, textAlign:'center', whiteSpace:'nowrap' },
};

function RoleSelect({ value, onChange, disabled }) {
  const v = String(value || 'user').toLowerCase();
  return (
    <Select size="small" value={v} onChange={(e)=>onChange(e.target.value)} disabled={disabled}>
      <MenuItem value="developer">developer</MenuItem>
      <MenuItem value="admin">admin</MenuItem>
      <MenuItem value="supervisor">supervisor</MenuItem>
      <MenuItem value="user">user</MenuItem>
    </Select>
  );
}
function StatusSelect({ value, onChange, disabled }) {
  const v = String(value || 'Active');
  return (
    <Select size="small" value={v} onChange={(e)=>onChange(e.target.value)} disabled={disabled}>
      <MenuItem value="Active">Active</MenuItem>
      <MenuItem value="Inactive">Inactive</MenuItem>
    </Select>
  );
}

function IdCell({ id, onCopy }) {
  return (
    <Box sx={{ display:'flex', alignItems:'center', gap:1, ...colSx.id }}>
      <Box sx={{ overflow:'hidden', textOverflow:'ellipsis' }}>{id}</Box>
      <Tooltip title="คัดลอก user_id">
        <span>
          <IconButton size="small" onClick={()=>onCopy(id)}>
            <ContentCopyIcon fontSize="inherit" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}

function Section({ title, rows, busy, onChangeRole, onChangeStatus, onDelete, sort, orderBy, order, onSort }) {
  return (
    <Paper variant="outlined" sx={{ p:2, borderRadius:3, mb:3 }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb:1.5 }}>{title}</Typography>
      <TableContainer sx={{ overflowX:'auto', maxHeight:{ xs:420, md:560 } }}>
        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              {[
                ['user_id','user_id', colSx.id],
                ['username','username', colSx.username],
                ['name','name', colSx.name],
                ['role','role', colSx.role],
                ['status','status', colSx.status],
                ['updated_at','updated_at', colSx.updated],
              ].map(([label, key, sx])=>(
                <TableCell key={key} sx={sx} sortDirection={orderBy===key?order:false}>
                  <TableSortLabel
                    active={orderBy===key}
                    direction={orderBy===key?order:'asc'}
                    onClick={()=>onSort(key)}
                  >
                    {label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell sx={colSx.action}>action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(u=>(
              <TableRow key={u.user_id} hover>
                <TableCell sx={colSx.id}>
                  <IdCell id={u.user_id} onCopy={onDelete.copy} />
                </TableCell>
                <TableCell sx={colSx.username}>{u.username || '-'}</TableCell>
                <TableCell sx={colSx.name}>{u.real_name || '-'}</TableCell>
                <TableCell sx={colSx.role}>
                  <RoleSelect value={u.role} onChange={(r)=>onChangeRole(u, r)} disabled={busy}/>
                  {!!u.role && <Chip size="small" sx={{ ml:1 }} label={String(u.role)} />}
                </TableCell>
                <TableCell sx={colSx.status}>
                  <StatusSelect value={u.status} onChange={(s)=>onChangeStatus(u, s)} disabled={busy}/>
                </TableCell>
                <TableCell sx={colSx.updated}>{u.updated_at || ''}</TableCell>
                <TableCell sx={colSx.action} align="center">
                  <Tooltip title="ลบ (ตั้งเป็น Inactive)">
                    <span>
                      <IconButton size="small" color="error" disabled={busy}
                        onClick={()=>onDelete.ask(u)}>
                        <DeleteOutlineIcon/>
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {rows.length===0 && (
              <TableRow><TableCell colSpan={7} align="center" sx={{ color:'text.secondary', py:3 }}>No users</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

function cmp(a,b,by){
  const A = (a?.[by] ?? '').toString(), B = (b?.[by] ?? '').toString();
  return A.localeCompare(B, 'th');
}

export default function UsersAdminPage(){
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState({ open:false, msg:'', sev:'success' });
  const [refreshedAt, setRefreshedAt] = useState(null);

  // sort state
  const [orderBy, setOrderBy] = useState('updated_at');
  const [order, setOrder] = useState('desc');

  const load = async () => {
    setBusy(true);
    try {
      const j = await listUsers();
      setRows(j.users || []);
      setRefreshedAt(new Date());
    } finally {
      setBusy(false);
    }
  };
  useEffect(()=>{ load(); }, []);

  const sorted = useMemo(()=>{
    const arr = [...rows];
    arr.sort((a,b)=> (order==='asc'?1:-1) * cmp(a,b,orderBy));
    return arr;
  }, [rows, order, orderBy]);

  const groups = useMemo(()=>{
    const dev = [], adm = [], usr = [];
    for (const u of sorted) {
      const r = String(u.role||'user').toLowerCase();
      if (r==='developer') dev.push(u);
      else if (r==='admin' || r==='supervisor') adm.push(u);
      else usr.push(u);
    }
    return { dev, adm, usr };
  }, [sorted]);

  const onSort = (by)=>{
    if (orderBy===by) setOrder(order==='asc' ? 'desc':'asc');
    else { setOrderBy(by); setOrder('asc'); }
  };

  const doRole = async (u, role) => {
    setBusy(true);
    try {
      await setUserRole(u.user_id, role);
      setSnack({ open:true, msg:'อัปเดตบทบาทแล้ว', sev:'success' });
      await load();                 // โหลดใหม่เพื่อย้ายแถวไปกลุ่มที่ถูกต้อง
    } catch (e) {
      setSnack({ open:true, msg:'เปลี่ยนบทบาทไม่สำเร็จ', sev:'error' });
    } finally { setBusy(false); }
  };

  const doStatus = async (u, status) => {
    setBusy(true);
    try {
      await setUserStatus(u.user_id, status);
      setSnack({ open:true, msg:'อัปเดตสถานะแล้ว', sev:'success' });
      await load();
    } catch {
      setSnack({ open:true, msg:'อัปเดตสถานะไม่สำเร็จ', sev:'error' });
    } finally { setBusy(false); }
  };

  const onCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setSnack({ open:true, msg:'คัดลอก user_id แล้ว', sev:'success' });
    } catch {
      setSnack({ open:true, msg:'คัดลอกไม่สำเร็จ', sev:'error' });
    }
  };

  const askDelete = async (u) => {
    if (!window.confirm(`ยืนยันลบผู้ใช้ (ตั้งสถานะเป็น Inactive):\n${u.real_name || u.username || u.user_id}`)) return;
    setBusy(true);
    try {
      await deleteUser(u.user_id);
      setSnack({ open:true, msg:'ตั้งเป็น Inactive แล้ว', sev:'success' });
      await load();
    } catch {
      setSnack({ open:true, msg:'ลบไม่สำเร็จ', sev:'error' });
    } finally { setBusy(false); }
  };

  return (
    <Container sx={{ pb:6 }}>
      <Box sx={{
        my:2, display:'flex', alignItems:'center', justifyContent:'space-between', gap:1,
        flexWrap:'wrap'
      }}>
        <Typography variant="h5" fontWeight={800}>Administrator management</Typography>
        <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
          {refreshedAt && (
            <Typography variant="caption" color="text.secondary" sx={{ display:{ xs:'none', sm:'block' } }}>
              อัปเดตล่าสุด {new Intl.DateTimeFormat('th-TH',{ dateStyle:'short', timeStyle:'short'}).format(refreshedAt)}
            </Typography>
          )}
          <Tooltip title="Refresh">
            <span>
              <IconButton onClick={load} disabled={busy}>
                <RefreshIcon/>
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Section
        title="Developers"
        rows={groups.dev}
        busy={busy}
        onChangeRole={doRole}
        onChangeStatus={doStatus}
        onDelete={{ ask:askDelete, copy:onCopy }}
        sort={cmp} orderBy={orderBy} order={order} onSort={onSort}
      />
      <Section
        title="Admins & Supervisors"
        rows={groups.adm}
        busy={busy}
        onChangeRole={doRole}
        onChangeStatus={doStatus}
        onDelete={{ ask:askDelete, copy:onCopy }}
        sort={cmp} orderBy={orderBy} order={order} onSort={onSort}
      />
      <Section
        title="Users"
        rows={groups.usr}
        busy={busy}
        onChangeRole={doRole}
        onChangeStatus={doStatus}
        onDelete={{ ask:askDelete, copy:onCopy }}
        sort={cmp} orderBy={orderBy} order={order} onSort={onSort}
      />

      <Snackbar open={snack.open} autoHideDuration={2000} onClose={()=>setSnack(s=>({...s, open:false}))}>
        <Alert severity={snack.sev} sx={{ width:'100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Container>
  );
}
