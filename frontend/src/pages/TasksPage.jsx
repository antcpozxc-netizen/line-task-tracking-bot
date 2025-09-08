import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Grid, List, ListItemButton, ListItemText,
  Paper, Table, TableHead, TableRow, TableCell, TableBody, TextField,
  Stack, Select, MenuItem, Chip, IconButton, Tooltip
} from '@mui/material';
import { listUsers, listTasks, updateTaskStatus } from '../api/client';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckIcon from '@mui/icons-material/Check';
import TableSortLabel from '@mui/material/TableSortLabel';
import { ListItemAvatar, Avatar } from '@mui/material';

function parseDeadline(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]||'00'}:${m[5]||'00'}:00`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
const fmt = (d) => !d ? '' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(d);

function StatusChip({ value }) {
  const v = String(value || 'pending').toLowerCase();
  const color = v === 'done' ? 'success' : v === 'doing' ? 'info' : 'default';
  return <Chip size="small" label={v} color={color} />;
}

function cmp(a,b,by){
  const A = (a?.[by] ?? '').toString(), B = (b?.[by] ?? '').toString();
  if (by==='deadline') { // แปลงเป็น Date ก่อน
    const da = parseDeadline(a.deadline), db = parseDeadline(b.deadline);
    return (da?.getTime()||0) - (db?.getTime()||0);
  }
  if (by==='updated_date' || by==='updated_at' || by==='created_date') {
    const da = new Date(a.updated_date || a.updated_at || a.created_date);
    const db = new Date(b.updated_date || b.updated_at || b.created_date);
    return (da?.getTime()||0) - (db?.getTime()||0);
  }
  return A.localeCompare(B, 'th');
}

export default function TasksPage() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [activeUser, setActiveUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState(''); // '', 'pending', 'doing', 'done'
  const [busy, setBusy] = useState(false);
  const [orderBy, setOrderBy] = useState('updated_date');
  const [order, setOrder] = useState('desc'); // 'asc' | 'desc'

  // โหลดผู้ใช้ทั้งหมดครั้งเดียว
  useEffect(() => { listUsers().then(j => setUsers(j.users || [])); }, []);

  // เหลือเฉพาะ role=user และเรียงตามชื่อจริง (fallback username)
  const userRows = useMemo(() => {
    const onlyUsers = (users || []).filter(
      u => String(u.role || 'user').toLowerCase() === 'user'
    );
    return [...onlyUsers].sort((a, b) =>
      (a.real_name || a.username || '').localeCompare(
        b.real_name || b.username || '',
        'th'
      )
    );
  }, [users]);

  // ✅ เลือกคนแรกให้อัตโนมัติทันทีที่มีข้อมูล (ไม่ต้องค้นหา)
  useEffect(() => {
    if (!activeUser && userRows.length) setActiveUser(userRows[0]);
  }, [userRows, activeUser]);

  // ถ้าไม่ได้พิมพ์ค้นหา => แสดง “ทั้งหมด”; ถ้าพิมพ์ค่อยกรอง
  const filteredUsers = useMemo(() => {
    if (!q) return userRows;
    const ql = q.toLowerCase().trim();
    return userRows.filter(u =>
      (`${u.user_id} ${u.username} ${u.real_name}`.toLowerCase()).includes(ql)
    );
  }, [userRows, q]);

  const load = async () => {
    if (!activeUser) return setTasks([]);
    const id = activeUser.user_id;
    const name = (activeUser.real_name || activeUser.username || '').trim();
    const j = await listTasks({ assignee_id: id, assignee_name: name, status });
    setTasks(j.tasks || []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [activeUser, status]);

  const counts = useMemo(() => {
    const c = { pending:0, doing:0, done:0 };
    for (const t of tasks) c[String(t.status || 'pending').toLowerCase()]++;
    return c;
  }, [tasks]);

  const act = async (taskId, toStatus) => {
    setBusy(true);
    await updateTaskStatus(taskId, toStatus);
    await load();
    setBusy(false);
  };

  const sortedTasks = useMemo(() => {
    const arr = [...tasks];
    arr.sort((a,b)=> (order==='asc'?1:-1) * cmp(a,b,orderBy));
    return arr;
  }, [tasks, order, orderBy]);

  const onSort = (by) => {
    if (orderBy===by) setOrder(order==='asc'?'desc':'asc');
    else { setOrderBy(by); setOrder('asc'); }
  };

  return (
    <Container sx={{ pb: 6 }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 2, textAlign: 'center' }}>
        Tasks by User
      </Typography>

      <Grid container spacing={2}>
        {/* Left: รายชื่อผู้ใช้ role=user แสดงทั้งหมดตั้งแต่แรก */}
        <Grid item xs={12} md={3}>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
            <TextField
              fullWidth size="small"
              label="ค้นหาผู้ใช้ (ตัวกรองเพิ่มเติม)"
              value={q} onChange={(e)=>setQ(e.target.value)}
              sx={{ mb: 1 }}
            />
            <List dense sx={{ maxHeight: 520, overflow: 'auto' }}>
              {filteredUsers.map(u=>(
                <ListItemButton
                  key={u.user_id}
                  selected={activeUser?.user_id===u.user_id}
                  onClick={()=>setActiveUser(u)}
                >
                  <ListItemAvatar>
                    <Avatar src={`/api/profile/${encodeURIComponent(u.user_id)}/photo`} />
                  </ListItemAvatar>
                  <ListItemText
                    primary={u.real_name || u.username || u.user_id}
                    secondary={u.user_id}
                  />
                </ListItemButton>

              ))}
            </List>
          </Paper>
        </Grid>

        {/* Right: ตารางงาน */}
        <Grid item xs={12} md={9}>
          <Paper variant="outlined" sx={{ borderRadius: 3 }}>
            <Box sx={{
              px:2, py:1.5, display:'flex', alignItems:'center', gap:1, flexWrap:'wrap'
            }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow:1 }}>
                {activeUser ? `Tasks of ${activeUser.real_name || activeUser.username || activeUser.user_id}` : 'เลือกผู้ใช้จากด้านซ้าย'}
              </Typography>
              <Select size="small" value={status} onChange={(e)=>setStatus(e.target.value)}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="pending">pending</MenuItem>
                <MenuItem value="doing">doing</MenuItem>
                <MenuItem value="done">done</MenuItem>
              </Select>
              <Tooltip title="Refresh">
                <span><IconButton onClick={load} disabled={!activeUser}><RefreshIcon/></IconButton></span>
              </Tooltip>
            </Box>

            <Stack direction="row" spacing={1} sx={{ px:2, pb:1 }}>
              <Chip size="small" label={`pending: ${counts.pending}`} />
              <Chip size="small" color="info" label={`doing: ${counts.doing}`} />
              <Chip size="small" color="success" label={`done: ${counts.done}`} />
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sortDirection={orderBy==='task_id'?order:false}>
                    <TableSortLabel active={orderBy==='task_id'} direction={orderBy==='task_id'?order:'asc'} onClick={()=>onSort('task_id')}>
                      task_id
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={orderBy==='detail'?order:false}>
                    <TableSortLabel active={orderBy==='detail'} direction={orderBy==='detail'?order:'asc'} onClick={()=>onSort('detail')}>
                      detail
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>status</TableCell>
                  <TableCell sortDirection={orderBy==='deadline'?order:false}>
                    <TableSortLabel active={orderBy==='deadline'} direction={orderBy==='deadline'?order:'asc'} onClick={()=>onSort('deadline')}>
                      deadline
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>note</TableCell>
                  <TableCell sortDirection={orderBy==='updated_date'?order:false}>
                    <TableSortLabel active={orderBy==='updated_date'} direction={orderBy==='updated_date'?order:'asc'} onClick={()=>onSort('updated_date')}>
                      updated_date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedTasks.map(t=>(
                  <TableRow key={t.task_id || Math.random()} hover>
                    <TableCell>{t.task_id}</TableCell>
                    <TableCell>{t.task_detail || t.detail || ''}</TableCell>
                    <TableCell><StatusChip value={t.status} /></TableCell>
                    <TableCell>{fmt(parseDeadline(t.deadline))}</TableCell>
                    <TableCell>{t.note || ''}</TableCell>
                    <TableCell>{fmt(new Date(t.updated_date || t.updated_at || t.created_date))}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="กำลังทำ">
                          <span>
                            <IconButton size="small" onClick={()=>act(t.task_id, 'doing')} disabled={busy}>
                              <PlayArrowIcon/>
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="เสร็จแล้ว">
                          <span>
                            <IconButton size="small" onClick={()=>act(t.task_id, 'done')} disabled={busy}>
                              <CheckIcon/>
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {activeUser && tasks.length===0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py:3, color:'text.secondary' }}>
                      No tasks
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
