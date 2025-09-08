import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Select, MenuItem, IconButton, Chip, Stack, Tooltip,
  Snackbar, Alert, TableSortLabel
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { listUsers, setUserRole, setUserStatus, deleteUser } from '../api/client';

const RoleBadge = ({ role }) => {
  const r = String(role || 'user').toLowerCase();
  const color = r==='developer' ? 'secondary' : (['admin','supervisor'].includes(r)?'primary':'default');
  return <Chip size="small" label={r} color={color} />;
};

function cmp(a,b,by){
  // สำหรับ sort ทุกคอลัมน์
  if (by==='updated_at') {
    return new Date(a.updated_at||0) - new Date(b.updated_at||0);
  }
  return String(a?.[by] ?? '').localeCompare(String(b?.[by] ?? ''), 'th');
}

function UsersTable({ title, rows, onChangeRole, onChangeStatus, onDelete }) {
  const [orderBy, setOrderBy] = useState('username');
  const [order, setOrder] = useState('asc');

  const sorted = useMemo(()=>{
    const arr = [...rows];
    arr.sort((a,b) => (order==='asc'?1:-1) * cmp(a,b,orderBy));
    return arr;
  }, [rows, orderBy, order]);

  const onSort = (by) => {
    if (orderBy===by) setOrder(order==='asc'?'desc':'asc');
    else { setOrderBy(by); setOrder('asc'); }
  };

  return (
    <Paper variant="outlined" sx={{ p:0, borderRadius:3, overflow:'hidden' }}>
      <Box sx={{ px:2, py:1.5, fontWeight:700 }}>{title}</Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {/* user_id คอลัมน์แคบ + copy */}
              <TableCell sx={{ width:180, whiteSpace:'nowrap' }}>
                <TableSortLabel active={orderBy==='user_id'} direction={orderBy==='user_id'?order:'asc'} onClick={()=>onSort('user_id')}>
                  user_id
                </TableSortLabel>
              </TableCell>

              <TableCell>
                <TableSortLabel active={orderBy==='username'} direction={orderBy==='username'?order:'asc'} onClick={()=>onSort('username')}>
                  username
                </TableSortLabel>
              </TableCell>

              <TableCell>
                <TableSortLabel active={orderBy==='real_name'} direction={orderBy==='real_name'?order:'asc'} onClick={()=>onSort('real_name')}>
                  name
                </TableSortLabel>
              </TableCell>

              <TableCell sx={{ width:170 }}>
                <TableSortLabel active={orderBy==='role'} direction={orderBy==='role'?order:'asc'} onClick={()=>onSort('role')}>
                  role
                </TableSortLabel>
              </TableCell>

              <TableCell sx={{ width:160 }}>
                <TableSortLabel active={orderBy==='status'} direction={orderBy==='status'?order:'asc'} onClick={()=>onSort('status')}>
                  status
                </TableSortLabel>
              </TableCell>

              <TableCell sx={{ width:220, display:{ xs:'none', md:'table-cell' } }}>
                <TableSortLabel active={orderBy==='updated_at'} direction={orderBy==='updated_at'?order:'asc'} onClick={()=>onSort('updated_at')}>
                  updated_at
                </TableSortLabel>
              </TableCell>

              <TableCell align="right" sx={{ width:80 }}>action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {sorted.map(u=>(
              <TableRow key={u.user_id} hover>
                <TableCell sx={{ maxWidth:180 }}>
                  <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                    <Box sx={{
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1,
                      fontFamily:'monospace'
                    }}>
                      {u.user_id}
                    </Box>
                    <Tooltip title="คัดลอก">
                      <IconButton size="small" onClick={()=>navigator.clipboard.writeText(u.user_id)}>
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>

                <TableCell sx={{minWidth:140}}>{u.username}</TableCell>
                <TableCell sx={{minWidth:160}}>{u.real_name || '-'}</TableCell>

                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Select
                      size="small"
                      value={String(u.role||'user').toLowerCase()}
                      onChange={(e)=>onChangeRole(u.user_id, e.target.value)}
                      sx={{ minWidth:130 }}
                    >
                      <MenuItem value="developer">developer</MenuItem>
                      <MenuItem value="admin">admin</MenuItem>
                      <MenuItem value="supervisor">supervisor</MenuItem>
                      <MenuItem value="user">user</MenuItem>
                    </Select>
                    <RoleBadge role={u.role}/>
                  </Stack>
                </TableCell>

                <TableCell>
                  <Select
                    size="small"
                    value={u.status || 'Active'}
                    onChange={(e)=>onChangeStatus(u.user_id, e.target.value)}
                    sx={{ minWidth:120 }}
                  >
                    <MenuItem value="Active">Active</MenuItem>
                    <MenuItem value="Inactive">Inactive</MenuItem>
                  </Select>
                </TableCell>

                <TableCell sx={{ display:{ xs:'none', md:'table-cell' } }}>
                  {u.updated_at || ''}
                </TableCell>

                <TableCell align="right">
                  <Tooltip title="ลบ (ตั้งสถานะเป็น Inactive)">
                    <span>
                      <IconButton color="error" onClick={()=>onDelete(u)}><DeleteOutlineIcon/></IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {sorted.length===0 && (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py:3, color:'text.secondary' }}>No users</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export default function UsersAdminPage(){
  const [all, setAll]   = useState([]);
  const [toast, setToast] = useState({ open:false, msg:'', sev:'success' });

  const load = async () => {
    const j = await listUsers();
    setAll(j.users || []);
  };
  useEffect(()=>{ load(); },[]);

  const devs  = useMemo(()=> all.filter(u => String(u.role||'').toLowerCase()==='developer'), [all]);
  const leads = useMemo(()=> all.filter(u => ['admin','supervisor'].includes(String(u.role||'').toLowerCase())), [all]);
  const users = useMemo(()=> all.filter(u => !['admin','supervisor','developer'].includes(String(u.role||'').toLowerCase())), [all]);

  const ok = (msg)=> setToast({open:true,msg,sev:'success'});
  const err= (msg)=> setToast({open:true,msg,sev:'error'});

  const onChangeRole = async (user_id, role) => {
    try { await setUserRole(user_id, role); ok('เปลี่ยนบทบาทแล้ว'); await load(); }
    catch { err('เปลี่ยนบทบาทไม่สำเร็จ'); }
  };
  const onChangeStatus = async (user_id, status) => {
    try { await setUserStatus(user_id, status); ok('อัปเดตสถานะแล้ว'); await load(); }
    catch { err('อัปเดตสถานะไม่สำเร็จ'); }
  };
  const onDelete = async (u) => {
    const go = window.confirm(`ยืนยันการลบผู้ใช้ ${u.real_name || u.username}? (ระบบจะตั้งเป็น Inactive)`);
    if (!go) return;
    try { await deleteUser(u.user_id); ok('ลบผู้ใช้แล้ว'); await load(); }
    catch { err('ลบผู้ใช้ไม่สำเร็จ'); }
  };

  return (
    <Container sx={{ pb:6 }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb:2 }}>Administrator management</Typography>

      <Stack spacing={2}>
        <UsersTable title="Developers" rows={devs}  onChangeRole={onChangeRole} onChangeStatus={onChangeStatus} onDelete={onDelete} />
        <UsersTable title="Admins & Supervisors" rows={leads} onChangeRole={onChangeRole} onChangeStatus={onChangeStatus} onDelete={onDelete} />
        <UsersTable title="Users" rows={users} onChangeRole={onChangeRole} onChangeStatus={onChangeStatus} onDelete={onDelete} />
      </Stack>

      <Snackbar open={toast.open} autoHideDuration={2000} onClose={()=>setToast(v=>({...v,open:false}))}>
        <Alert severity={toast.sev} variant="filled" sx={{ width: '100%' }}>{toast.msg}</Alert>
      </Snackbar>
    </Container>
  );
}
