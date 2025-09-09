import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Chip, Select, MenuItem, IconButton, Divider, Tooltip,
  Snackbar, Alert, Button, Stack
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import useMe from '../hooks/useMe';
import { listUsers, setUserRole, setUserStatus, deleteUser, updateUserProfile } from '../api/client';


// เดิม: { user:1, supervisor:2, admin:3, developer:4 }
const ROLE_RANK = { user: 1, admin: 2, supervisor: 3, developer: 4 };

const colSx = {
  id:      { width:{ xs:130, sm:220 }, maxWidth:260, whiteSpace:'nowrap' },
  username:{ width:{ xs:120, md:160 }, whiteSpace:'nowrap' },
  name:    { minWidth:{ xs:260, md:360 }, whiteSpace:'nowrap' },
  role: {
    width: { xs: 150, md: 200 },
    whiteSpace: 'nowrap',
    pr: { xs: 2, md: 5 }           // ขยับช่องว่างด้านขวา role
  },
  status: {
    width: { xs: 140, md: 180 },
    whiteSpace: 'nowrap',
    pl: { xs: 1.5, md: 3 }         // ขยับช่องว่างด้านซ้าย status
  },
  action: {
    width: { xs: 64, md: 90 },      // ลดความกว้างคอลัมน์ action บนมือถือ
    textAlign: 'center',
    whiteSpace: 'nowrap'
  },
  updated: { width:{ xs:0, md:220 }, display:{ xs:'none', md:'table-cell' }, whiteSpace:'nowrap' },
  
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
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { user_id, name }
  const [snack, setSnack] = useState({ open:false, msg:'', sev:'success' });
  const [refreshedAt, setRefreshedAt] = useState(null);

  // sort state (ใช้ร่วมกันทั้ง 3 ตาราง)
  const [orderBy, setOrderBy] = useState('updated_at');
  const [order, setOrder] = useState('desc');

  // ให้ developer เห็น role เท่ากับตัวเองได้ (<=) ส่วนคนอื่นเห็นได้เฉพาะต่ำกว่า (<)

  const ORDERED_ROLES = ['developer', 'supervisor', 'admin', 'user'];
  const roleChoices = useMemo(() => {
    return ORDERED_ROLES.filter((r) => {
      const rk = ROLE_RANK[r] || 0;
      return myRole === 'developer' ? rk <= myRank : rk < myRank;
    });
  }, [myRole, myRank]);


  const load = async () => {
    setBusy(true);
    try {
      const j = await listUsers();
      setRows([...(j.users || [])]);
      setRefreshedAt(new Date());
    } catch (e) {
      setSnack({ open:true, msg:'โหลดรายชื่อไม่สำเร็จ', sev:'error' });
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

  const canEdit = (targetRole) =>
    (ROLE_RANK[String(targetRole||'user')] || 0) < myRank;

  const baseRoles = ['user','admin','supervisor','developer'];

  const getAllowedRoles = (targetRole) => {
    const target = String(targetRole || 'user');
    const my = myRank;
    let list = ORDERED_ROLES.filter(r => (ROLE_RANK[r] || 0) <= my);
    const targetRk = ROLE_RANK[target] || 0;
    if (targetRk >= my) list = Array.from(new Set([target, ...list]));
    return list;
  };

  // ---- actions ----
  const doRole = async (u, role) => {
    const targetRank = ROLE_RANK[String(u.role||'user').toLowerCase()] || 0;
    const newRank    = ROLE_RANK[String(role||'user').toLowerCase()] || 0;

    // ห้ามแก้ peer/สูงกว่า
    if (targetRank >= myRank) {
      setSnack({ open:true, msg:'คุณไม่มีสิทธิ์เปลี่ยนสิทธิ์นี้', sev:'error' });
      return;
    }
    // ทุก role ตั้งได้ ≤ ตัวเอง (เท่าตัวเองได้)
    if (newRank > myRank) {
      setSnack({ open:true, msg:'คุณไม่มีสิทธิ์เปลี่ยนสิทธิ์นี้', sev:'error' });
      return;
    }

    setBusy(true);
    try {
      await setUserRole(u.user_id, role);
      setSnack({ open:true, msg:'อัปเดตบทบาทแล้ว', sev:'success' });
      await load();
    } catch {
      setSnack({ open:true, msg:'เปลี่ยนบทบาทไม่สำเร็จ', sev:'error' });
    } finally {
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
  // --- inline edit username/name ---
  const [editingId, setEditingId] = useState(null);
  const [draftUsername, setDraftUsername] = useState('');
  const [draftName, setDraftName] = useState('');

  const startEdit = (u) => {
    if (!u) return;
    setEditingId(u.user_id);
    setDraftUsername(u.username || '');
    setDraftName(u.real_name || '');
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraftUsername('');
    setDraftName('');
  };

  const saveEdit = async (u) => {
    if (!u) return;
    setBusy(true);
    try {
      await updateUserProfile(u.user_id, {
        username: draftUsername,
        real_name: draftName
      });
      setSnack({ open:true, msg:'อัปเดตโปรไฟล์แล้ว', sev:'success' });
      cancelEdit();
      await load();
    } catch (e) {
      setSnack({ open:true, msg:'อัปเดตโปรไฟล์ไม่สำเร็จ', sev:'error' });
    } finally {
      setBusy(false);
    }
  };

  function TableBlock({ title, items }) {
    return (
      <Paper variant="outlined" sx={{ mb: 3, borderRadius: 3, overflow:'hidden' }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
        </Box>
        <Divider />
        <TableContainer sx={{ overflowX:'auto', maxHeight:{ xs:420, md:560 } }}>
          <Table 
            size="small" 
            stickyHeader 
            sx={{ 
              tableLayout: 'auto', // ให้คอลัมน์ขยายตามเนื้อหา (ชื่อยาวก็เห็นเต็ม) 
              '& td, & th': { px: { xs: 1, sm: 2 }, fontSize: { xs: 13, sm: 14 } } 
            }} 
          >
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
                    <TableCell sx={colSx.username}>
                      {editingId === u.user_id ? (
                        <Box sx={{ display:'flex', gap:1, alignItems:'center' }}>
                          <input
                            value={draftUsername}
                            onChange={e=>setDraftUsername(e.target.value)}
                            disabled={!editable || busy}
                            style={{ width: 140, font: 'inherit', padding: '4px 6px' }}
                          />
                        </Box>
                      ) : (
                        <Box sx={{ whiteSpace:'nowrap' }}>{u.username || '-'}</Box>
                      )}
                    </TableCell>
                    <TableCell sx={colSx.name}>
                      {editingId === u.user_id ? (
                        <Box sx={{ display:'flex', gap:1, alignItems:'center' }}>
                          <input
                            value={draftName}
                            onChange={e=>setDraftName(e.target.value)}
                            disabled={!editable || busy}
                            style={{ width: 260, font: 'inherit', padding: '4px 6px' }}
                          />
                        </Box>
                      ) : (
                        // ชื่อ: บรรทัดเดียว (ไม่ตัด …) และปล่อยให้เลื่อนแนวนอนทั้งตาราง
                        <Box sx={{ whiteSpace:'nowrap' }}>{u.real_name || '-'}</Box>
                      )}
                    </TableCell>
                    <TableCell sx={colSx.role}>
                      <Stack spacing={0.5} direction={{ xs:'row', md:'column' }} alignItems="flex-start">
                        <Select
                          size="small"
                          value={r}
                          disabled={!editable || busy}
                          sx={{ minWidth:{ xs:118, sm:132 }, '& .MuiSelect-select':{ py:0.5 } }}
                          onChange={(e)=>doRole(u, e.target.value)}
                        >
                          {getAllowedRoles(r).map(v => (<MenuItem key={v} value={v}>{v}</MenuItem>))}
                        </Select>
                        {/* แสดง chip แค่บน md+ และวาง “ใต้” select เพื่อลดการเบียดฝั่ง status */}
                        <Chip
                          size="small"
                          sx={{ display:{ xs:'none', md:'inline-flex' } }}
                          label={r}
                          color={roleColor(r)}
                        />
                      </Stack>
                    </TableCell>
                    <TableCell sx={colSx.status}>
                      <Select
                        size="small"
                        value={u.status || 'Active'}
                        disabled={!editable || busy}
                        onChange={(e)=>doStatus(u, e.target.value)}
                        sx={{
                          minWidth: { xs: 110, sm: 120 },        // ⬅︎ แคบลงบนมือถือ
                          '& .MuiSelect-select': { py: 0.5 }
                        }}
                      >
                        <MenuItem value="Active">Active</MenuItem>
                        <MenuItem value="Inactive">Inactive</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell sx={colSx.updated}>{u.updated_at || ''}</TableCell>
                    <TableCell sx={colSx.action} align="center">
                      {editable && editingId !== u.user_id && (
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Button size="small" variant="outlined" disabled={busy} onClick={()=>startEdit(u)}>แก้ไข</Button>
                          <Tooltip title="ตั้งเป็น Inactive">
                            <span>
                              <IconButton color="error" disabled={busy}
                                onClick={()=>setConfirm({ user_id: u.user_id, name: u.real_name || u.username || u.user_id })}>
                                <DeleteIcon />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      )}
                      {editable && editingId === u.user_id && (
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Button size="small" variant="contained" disabled={busy}
                            onClick={()=>saveEdit(u)}>บันทึก</Button>
                          <Button size="small" variant="text" disabled={busy} onClick={cancelEdit}>ยกเลิก</Button>
                        </Stack>
                      )}
                      {!editable && (
                        <Tooltip title="ห้ามแก้ไขผู้ใช้ระดับเท่ากัน/สูงกว่า">
                          <span><Button size="small" disabled>แก้ไข</Button></span>
                        </Tooltip>
                      )}
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
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            variant="outlined"
            onClick={()=>navigate('/admin/users?assignedBy=me')}
          >
            ดูงานที่ฉันสั่ง
          </Button>
          {refreshedAt && (
            <Typography variant="caption" color="text.secondary" sx={{ display:{ xs:'none', sm:'block' } }}>
              อัปเดตล่าสุด {new Intl.DateTimeFormat('th-TH',{ dateStyle:'short', timeStyle:'short'}).format(refreshedAt)}
            </Typography>
          )}
          <Tooltip title="Refresh">
            <span><IconButton onClick={load} disabled={busy}><RefreshIcon/></IconButton></span>
          </Tooltip>
        </Stack>
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
