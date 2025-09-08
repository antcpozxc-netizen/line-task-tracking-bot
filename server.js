// server.js — Tasks Tracker (LINE OA + Apps Script)
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const express = require('express');
const crypto  = require('crypto');
const cookie  = require('cookie');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const cron    = require('node-cron');

const app  = express();
const PORT = process.env.PORT || 3000;
const TZ   = process.env.TZ || 'Asia/Bangkok';
const assignPreset = new Map();

// ── ENV
const {
  // LINE Login (เว็บ – ถ้าไม่ได้ใช้ หน้าเว็บก็ไม่มีผล)
  LINE_LOGIN_CHANNEL_ID,
  LINE_LOGIN_CHANNEL_SECRET,
  LINE_LOGIN_CALLBACK_URL,

  // Messaging API
  LINE_CHANNEL_ID,
  LINE_CHANNEL_SECRET,
  LINE_CHANNEL_ACCESS_TOKEN, // ถ้าใส่จะใช้ค่านี้โดยตรง

  // Apps Script (Data API)
  APPS_SCRIPT_EXEC_URL,
  APP_SHARED_KEY,            // หรือใช้ APP_SCRIPT_SHARED_KEY ก็ได้

  // Rich menus
  RICHMENU_ID_PREREG,
  RICHMENU_ID_MAIN,

  // Web/App
  PUBLIC_APP_URL,
  APP_JWT_SECRET,

  // (ทางเลือก) ตั้ง default rich menu ตอนบูต
  RICHMENU_DEFAULT_ID,
  CRON_KEY, 
} = process.env;

// ── fetch (polyfill)
const fetchFn = (...args) =>
  (global.fetch ? global.fetch(...args) : import('node-fetch').then(({default:f}) => f(...args)));

// ── Express: raw body เพื่อ verify signature
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; }}));

// ── Utils
function urlQuery(obj) {
  const q = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k,v]) => q.append(k, String(v)));
  return q.toString();
}

function signHmacSHA256(secret, raw) {
  return crypto.createHmac('sha256', secret).update(raw).digest('base64');
}
function assertLineSignature(req) {
  const sig = req.get('x-line-signature') || '';
  const expected = signHmacSHA256(LINE_CHANNEL_SECRET, req.rawBody || Buffer.from(''));
  if (sig !== expected) throw new Error('BAD_SIGNATURE');
}
function shortId(s='') { s = String(s); return s.length <= 4 ? s : s.slice(-4); }
function clip(s, n){ s = String(s||''); return s.length>n ? s.slice(0,n-1)+'…' : s; }
function roleLabel(r) {
  const m = { admin:'Admin', supervisor:'Supervisor', user:'User', developer:'Developer' };
  return m[String(r||'').toLowerCase()] || r || 'User';
}
function normalizeRole(r){
  const v = String(r||'').trim().toLowerCase();
  const map = {
    'admin':'admin','แอดมิน':'admin',
    'supervisor':'supervisor','หัวหน้า':'supervisor',
    'developer':'developer','dev':'developer','นักพัฒนา':'developer',
    'user':'user','ผู้ใช้':'user'
  };
  return map[v] || (v || 'user');
}

function isRoleWord(w){
  const set = new Set([
    'admin','แอดมิน',
    'supervisor','หัวหน้า',
    'developer','dev','นักพัฒนา',
    'user','ผู้ใช้'
  ]);
  return set.has(String(w||'').trim().toLowerCase());
}





// ── LINE Token: auto-issue & cache
let tokenCache = {
  accessToken: (LINE_CHANNEL_ACCESS_TOKEN || '').trim() || null,
  expiresAt: 0
};
const TOKEN_MARGIN = 60;
async function issueAccessToken(){
  if (!LINE_CHANNEL_ID || !LINE_CHANNEL_SECRET) {
    throw new Error('Missing LINE_CHANNEL_ID/SECRET');
  }
  const res = await fetchFn('https://api.line.me/v2/oauth/accessToken', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body: urlQuery({
      grant_type:'client_credentials',
      client_id: LINE_CHANNEL_ID,
      client_secret: LINE_CHANNEL_SECRET
    })
  });
  if (!res.ok) throw new Error('issueAccessToken failed '+res.status);
  const j = await res.json();
  tokenCache = {
    accessToken: j.access_token,
    expiresAt: Date.now() + Math.max(0,(j.expires_in||0)-TOKEN_MARGIN)*1000
  };
  return tokenCache.accessToken;
}
async function getAccessToken(){
  if (tokenCache.accessToken && (tokenCache.expiresAt===0 || Date.now()<tokenCache.expiresAt))
    return tokenCache.accessToken;
  return await issueAccessToken();
}
async function callLineAPI(path, options={}){
  async function go(refresh){
    const token = await getAccessToken();
    const headers = Object.assign({}, options.headers, { Authorization:`Bearer ${token}` });
    const res = await fetchFn('https://api.line.me'+path, { ...options, headers });
    if (res.status===401 && !refresh){ await issueAccessToken(); return go(true); }
    return res;
  }
  return await go(false);
}

// ── Apps Script helper
async function callAppsScript(action, data) {
  if (!APPS_SCRIPT_EXEC_URL) throw new Error('Missing APPS_SCRIPT_EXEC_URL');
  const key = APP_SHARED_KEY || process.env.APP_SCRIPT_SHARED_KEY || '';
  const res = await fetchFn(APPS_SCRIPT_EXEC_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ action, app_key:key, ...data })
  });
  const j = await res.json();
  if (!j.ok) throw new Error('AppsScript error: '+(j.error||'unknown'));
  return j;
}

// ── LINE helpers
// แทนที่ฟังก์ชัน reply เดิมทั้งก้อน
async function reply(replyToken, text, quickItems){
  const msg = { type:'text', text:String(text||'') };
  if (Array.isArray(quickItems) && quickItems.length > 0) {
    msg.quickReply = { items: quickItems };
  }
  const res = await callLineAPI('/v2/bot/message/reply', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ replyToken, messages: [msg] })
  });
  if (!res.ok) { console.error('REPLY_ERR', res.status, await res.text().catch(()=>'')); }
}

async function replyFlex(replyToken, flexBubble, quickItems){
  const payload = {
    replyToken,
    messages:[
      { type:'flex', altText:'รายการ', contents:flexBubble }
    ]
  };
  if (Array.isArray(quickItems) && quickItems.length>0) {
    payload.messages[0].quickReply = { items: quickItems };
  }
  const res = await callLineAPI('/v2/bot/message/reply',{
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) { console.error('REPLY_MSG_ERR', res.status, await res.text().catch(()=>'')); }
}

// ส่ง Flex หลาย bubble ในข้อความเดียว (carousel)
async function replyFlexMany(replyToken, bubbles, quickItems) {
  const msg = {
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'รายการ',
      contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles.slice(0, 10) }
    }]
  };
  if (Array.isArray(quickItems) && quickItems.length > 0) {
    msg.messages[0].quickReply = { items: quickItems };
  }
  const res = await callLineAPI('/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg)
  });
  if (!res.ok) console.error('REPLY_FLEX_MANY_ERR', res.status, await res.text().catch(()=> ''));
}

async function pushFlex(to, flexBubble, quickItems){
  if (!to) return;
  const payload = {
    to,
    messages:[{ type:'flex', altText:'งานที่ถูกเตือน', contents:flexBubble }]
  };
  if (Array.isArray(quickItems) && quickItems.length>0) {
    payload.messages[0].quickReply = { items: quickItems };
  }
  const res = await callLineAPI('/v2/bot/message/push', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) console.error('PUSH_FLEX_ERR', res.status, await res.text().catch(()=> ''));
}



function statusRank(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'doing')  return 0;
  if (v === 'pending')return 1;
  if (v === 'done')   return 2;
  return 9;
}
function roleRank(r) {
  const v = String(r || '').toLowerCase();
  if (v === 'admin')      return 0;
  if (v === 'supervisor') return 1;
  if (v === 'developer')  return 2;
  if (v === 'user')       return 3;
  return 9;
}
function compareDue(a, b) {
  const aDue = parseDeadline(a?.deadline);
  const bDue = parseDeadline(b?.deadline);
  const aMs = Number.isNaN(aDue) ? Infinity : aDue;
  const bMs = Number.isNaN(bDue) ? Infinity : bDue;
  return aMs - bMs; // เดดไลน์เร็วกว่าอยู่ก่อน
}


// ------- Card Renderers -------
function renderTaskCard({ id, title, date, due, status, assignee, assigner }, options = {}) {
  const statusColor = (s => {
    const v = String(s||'').toLowerCase();
    if (v === 'done')  return '#2e7d32';
    if (v === 'doing') return '#1565c0';
    return '#9e9e9e';
  })(status);

  const footerContents = [];

  // ถ้าไม่ได้สั่งปิด ให้ใส่ปุ่มสถานะ (ค่าเริ่มต้น = แสดง)
  if (options.actions !== false) {
    footerContents.push(
      { type:'button', style:'primary',   height:'sm',
        action:{ type:'message', label:'✅ เสร็จแล้ว',   text:`done ${id}` } },
      { type:'button', style:'secondary', height:'sm',
        action:{ type:'message', label:'⏳ กำลังทำ',     text:`กำลังดำเนินการ ${id}` } }
    );
  }

  return {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type: 'text', text: title || '-', weight: 'bold', wrap: true },
        {
          type: 'box', layout: 'vertical', spacing: 'xs',
          contents: [
            { type: 'text', text: `ID: ${id}`, size: 'xs', color: '#777777' },
            { type: 'text', text: `อัปเดต: ${date || '-'}`, size: 'xs', color: '#777777' },
            { type: 'text', text: `กำหนดส่ง: ${due || '-'}`, size: 'xs', color: '#555555' },
            assignee ? { type: 'text', text: `ผู้รับ: ${assignee}`, size: 'xs', color: '#555555' } : { type:'filler' },
            assigner ? { type: 'text', text: `ผู้สั่ง: ${assigner}`, size: 'xs', color: '#555555' } : { type:'filler' }
          ]
        },
        {
          type: 'box', layout: 'baseline', contents: [
            { type: 'text', text: (String(status||'').toUpperCase()), size: 'xs', color: statusColor, weight: 'bold' }
          ]
        }
      ]
    },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerContents }
  };
}



function renderUserCard({ name, role, status, updated }) {
  return {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type: 'text', text: name || '-', weight: 'bold', wrap: true },
        { type: 'text', text: `บทบาท: ${role || '-'}`, size: 'sm' },
        { type: 'text', text: `สถานะ: ${status || '-'}`, size: 'sm' },
        { type: 'text', text: `อัปเดต: ${updated || '-'}`, size: 'xs', color: '#777777' }
      ]
    }
  };
}

async function pushText(to, text){
  if (!to) return;
  const res = await callLineAPI('/v2/bot/message/push',{
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ to, messages:[{ type:'text', text:String(text||'') }] })
  });
  if (!res.ok) { console.error('PUSH_ERR', res.status, await res.text().catch(()=>'')); }
}

async function pushTextQuick(to, text, quickItems){
  if (!to) return;
  const msg = { type:'text', text:String(text||'') };
  if (Array.isArray(quickItems) && quickItems.length>0) {
    msg.quickReply = { items: quickItems };
  }
  const res = await callLineAPI('/v2/bot/message/push', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ to, messages:[msg] })
  });
  if (!res.ok) { console.error('PUSH_QR_ERR', res.status, await res.text().catch(()=>'')); }
}

async function getDisplayName(userId){
  try{
    const r = await callLineAPI('/v2/bot/profile/'+userId,{method:'GET'});
    if (!r.ok) return '';
    const j = await r.json(); return j.displayName || '';
  }catch{ return ''; }
}
async function linkRichMenuToUser(userId, richMenuId){
  if (!userId || !richMenuId) return;
  await callLineAPI(`/v2/bot/user/${userId}/richmenu/${richMenuId}`, { method:'POST' });
}
async function setDefaultRichMenu(richMenuId){
  if (!richMenuId) return;
  await callLineAPI(`/v2/bot/user/all/richmenu/${richMenuId}`, { method:'POST' });
}
// ลิงก์ rich menu ให้ผู้ใช้ทุกคน (ทีละคน เผื่อกรณีเคยลิงก์เมนูรายบุคคลไว้)
async function linkRichMenuToAllUsers(richMenuId){
  if (!richMenuId) return;
  try {
    const r = await callAppsScript('list_users', {});
    const users = r.users || [];
    for (const u of users) {
      if (!u.user_id) continue;
      try {
        await linkRichMenuToUser(u.user_id, richMenuId);
        // กัน rate limit: เว้นจังหวะเล็กน้อย
        await new Promise(res => setTimeout(res, 60));
      } catch (e) {
        console.error('LINK_RM_USER_ERR', u.user_id, e?.status || e);
      }
    }
  } catch (e) {
    console.error('LINK_RM_ALL_ERR', e);
  }
}
// ── Task helpers
async function getTaskById(task_id){
  try {
    const r = await callAppsScript('get_task', { task_id });
    if (r && r.ok && r.task) return r.task;
  } catch {}
  try {
    const all = await callAppsScript('list_tasks', {});
    return (all.tasks||[]).find(t => String(t.task_id)===String(task_id)) || null;
  } catch { return null; }
}
// merge update บางฟิลด์
async function updateTaskFields(taskId, patch){
  const cur = await getTaskById(taskId);
  if (!cur) throw new Error('task not found: '+taskId);
  const merged = {
    task_id: cur.task_id,
    assigner_name: cur.assigner_name || '',
    assigner_id:   cur.assigner_id || '',
    assignee_name: cur.assignee_name || '',
    assignee_id:   cur.assignee_id || '',
    task_detail:   cur.task_detail || '',
    status:        cur.status || 'pending',
    created_date:  cur.created_date || new Date().toISOString(),
    updated_date:  new Date().toISOString(),
    deadline:      cur.deadline || '',
    note:          cur.note || '',
    ...patch
  };
  await callAppsScript('upsert_task', merged);
  return merged;
}
async function resolveAssignee(mention){
  const key = String(mention||'').trim().toLowerCase();
  if (!key) return null;
  const r = await callAppsScript('list_users', {});
  const users = r.users || [];
  let hit = users.find(u =>
    String(u.user_id||'')===mention ||
    String(u.username||'').toLowerCase()===key ||
    String(u.real_name||'').toLowerCase()===key
  );
  if (hit) return hit;
  hit = users.find(u =>
    String(u.username||'').toLowerCase().includes(key) ||
    String(u.real_name||'').toLowerCase().includes(key)
  );
  return hit || null;
}

// ========== Natural deadline helper ==========
function parseNaturalDue(s) {
  if (!s) return '';
  s = String(s).trim().toLowerCase();

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  // ค่าเริ่มต้นให้ดูใช้งานจริง: วันนี้=17:30, พรุ่งนี้=09:00, วันไทยอื่นๆ=17:30
  const toISO = (d, h = 17, m = 30) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;

  let m;

  // +Nd [HH:mm]
  m = s.match(/^\+(\d+)d(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(m[1]));
    const hh = m[2] ? Number(m[2]) : 17, mm = m[3] ? Number(m[3]) : 30;
    return toISO(d, hh, mm);
  }

  // วันนี้/พรุ่งนี้ [HH:mm]  → วันนี้ default 17:30, พรุ่งนี้ default 09:00
  m = s.match(/^(วันนี้|พรุ่งนี้)(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const add = m[1] === 'พรุ่งนี้' ? 1 : 0;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
    const hasTime = !!m[2];
    const hh = hasTime ? Number(m[2]) : (add ? 9 : 17);
    const mm = hasTime ? Number(m[3]) : (add ? 0 : 30);
    return toISO(d, hh, mm);
  }

  // "ก่อนบ่าย 3" / "บ่าย 3[:mm]" → วันนี้ 15:00 (หรือเวลาที่ระบุ)
  m = s.match(/^(?:ก่อน)?บ่าย\s*(\d{1,2})(?::(\d{2}))?$/);
  if (m) {
    const hr = Math.min(12 + Number(m[1]), 23);
    const mn = m[2] ? Number(m[2]) : 0;
    return toISO(now, hr, mn);
  }

  // [วันไทย]นี้ [HH:mm]  (ยอมให้มี "วัน" นำหน้า)
  const thaiDays = { 'อาทิตย์':0,'จันทร์':1,'อังคาร':2,'พุธ':3,'พฤหัส':4,'ศุกร์':5,'เสาร์':6 };
  m = s.match(/^(?:วัน)?([ก-๙]+)นี้(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m && m[1] in thaiDays) {
    const target = thaiDays[m[1]], cur = now.getDay();
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7; // ถ้าตรงวันนี้ ให้ขยับเป็นสัปดาห์หน้า
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    const hh = m[2] ? Number(m[2]) : 17, mm = m[3] ? Number(m[3]) : 30;
    return toISO(d, hh, mm);
  }

  // [วันไทย]หน้า [HH:mm]  (ยอมให้มี "วัน" นำหน้า)
  m = s.match(/^(?:วัน)?([ก-๙]+)หน้า(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m && m[1] in thaiDays) {
    const target = thaiDays[m[1]], cur = now.getDay();
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7; // ถ้าวันเดียวกัน → ไปสัปดาห์หน้า
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    const hh = m[2] ? Number(m[2]) : 17, mm = m[3] ? Number(m[3]) : 30;
    return toISO(d, hh, mm);
  }

  // dd/MM หรือ dd/MM HH:mm (ปีปัจจุบัน)
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const y = now.getFullYear(), mo = Number(m[2]) - 1, da = Number(m[1]);
    const hh = m[3] ? Number(m[3]) : 17, mm = m[4] ? Number(m[4]) : 30;
    return toISO(new Date(y, mo, da), hh, mm);
  }

  // ไม่เข้าเงื่อนไขใด ๆ → ส่งกลับให้ parser เดิมจัดการ
  return s;
}

// ========== Loose assignment parser (Thai free text) ==========
function parseAssignLoose(text) {
  if (!text) return null;
  const raw = String(text).trim();

  // ต้องมี @mention ที่ไหนก็ได้ในประโยค
  const mUser = raw.match(/@([^\s:：]+)/);
  if (!mUser) return null;

  const assigneeName = mUser[1].trim();
  let body = raw.replace(mUser[0], ' ').replace(/\s+/g, ' ').trim();

  // คำฟิลเลอร์ยอดฮิต
  body = body.replace(/\bของาน\b/g, ' ').replace(/\s+/g, ' ').trim();

  // แท็กเร่งด่วน/ปกติ
  let note = '';
  if (/(ด่วน(ที่สุด|สุด)?|urgent)/i.test(body)) {
    note = '[URGENT]';
    body = body.replace(/(ด่วน(ที่สุด|สุด)?|urgent)/ig, ' ');
  } else if (/(ไม่รีบ(?:นะ)?|normal|ค่อยทำ)/i.test(body)) {
    // เก็บคำเดิมเป็นโน้ต
    note = (note ? (note + ' ') : '') + 'ไม่รีบ';
    body = body.replace(/(ไม่รีบ(?:นะ)?|normal|ค่อยทำ)/ig, ' ');
  }

  // เก็บกวาดฟิลเลอร์ปลายประโยค (ให้จับได้ทั้งมี/ไม่มีเว้นวรรค)
  body = body
    .replace(/(?:^|\s)(ก่อน|ภายใน|นะ|ด้วย)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let deadline = '';
  const remove = re => { body = body.replace(re, ' ').replace(/\s+/g, ' ').trim(); };

  // วันนี้/พรุ่งนี้ [HH:mm]
  let m = body.match(/(วันนี้|พรุ่งนี้)(?:\s*(\d{1,2})(?::(\d{2}))?)?/);
  if (m) {
    const hasTime = !!m[2];
    const str = hasTime
      ? `${m[1]} ${String(m[2]).padStart(2,'0')}:${String(m[3]||'0').padStart(2,'0')}`
      : m[1]; // ไม่มีเวลา → ให้ parseNaturalDue ใส่ default (วันนี้ 17:30, พรุ่งนี้ 09:00)
    deadline = parseNaturalDue(str);
    remove(m[0]);
  }

  // [วันไทย](นี้|หน้า) [HH:mm]  เช่น "จันทร์หน้า", "พุธนี้ 14:00"
  if (!deadline) {
    m = body.match(/(?:วัน)?(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)(นี้|หน้า)(?:\s*(\d{1,2})(?::(\d{2}))?)?/);
    if (m) {
      const hasTime = !!m[3];
      const str = hasTime
        ? `${m[1]}${m[2]} ${String(m[3]).padStart(2,'0')}:${String(m[4]||'0').padStart(2,'0')}`
        : `${m[1]}${m[2]}`; // ไม่มีเวลา → default 17:30
      deadline = parseNaturalDue(str);
      remove(m[0]);
    }
  }

  // ก่อนบ่าย 3 / บ่าย 3[:mm] → วันนี้
  if (!deadline) {
    m = body.match(/(ก่อน)?\s*บ่าย\s*(\d{1,2})(?::(\d{2}))?/i);
    if (m) {
      let hh = Number(m[2]); if (hh >= 1 && hh <= 11) hh += 12; // บ่าย 1–11 → 13–23
      const mm = m[3] ? Number(m[3]) : 0;
      const now = new Date();
      const dstr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`;
      deadline = dstr;
      remove(m[0]);
    }
  }

  // รูป dd/MM หรือ dd/MM HH:mm → ปีนี้
  if (!deadline) {
    m = body.match(/\b(\d{1,2}\/\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?\b/);
    if (m) {
      deadline = parseNaturalDue(m[0]);
      remove(m[0]);
    }
  }

  // ถ้ายังไม่ได้ แต่มี "วันนี้/พรุ่งนี้" ลอย ๆ → ให้ default
  if (!deadline) {
    if (/วันนี้/.test(body))  { deadline = parseNaturalDue('วันนี้');  remove(/วันนี้/); }
    else if (/พรุ่งนี้/.test(body)) { deadline = parseNaturalDue('พรุ่งนี้'); remove(/พรุ่งนี้/); }
  }

  // ตัดคำฟิลเลอร์ปลายประโยค
  body = body.replace(/\b(ก่อน|ภายใน|นะ|ด้วย)\b/g, ' ').replace(/\s+/g,' ').trim();

  const detail = body || '-';
  return { assigneeName, detail, deadline, note };
}




// ── Parsers
function parseRegister(text){
  // รองรับ: ลงทะเบียน / สมัคร / ลงชื่อ / register / signup  + จะมีหรือไม่มี ":" ก็ได้
  const m = text.match(/^(?:ลงทะเบียน|สมัคร|ลงชื่อ|register|signup)\s*[:：]?\s*(.+)$/i);
  if (!m) return null;
  const payload = m[1].trim();

  // ถ้ามี , หรือ | ใช้กติกาเดิม
  if (/[,\|]/.test(payload)) {
    const parts = payload.split(/\s*[,\|]\s*/).map(s => s.trim()).filter(Boolean);
    const [username='', realName='', role=''] = parts;
    return { username, realName, role };
  }

  // เว้นวรรคล้วน: ลงทะเบียน: po ทดสอบ ระบบ [บทบาท]
  const parts = payload.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { username: parts[0] || '', realName: '', role: '' };

  const username = parts[0];
  const maybeRole = parts[parts.length - 1];

  // เลือก “คำท้าย” เป็นบทบาทเมื่อเป็นคำที่รู้จักเท่านั้น (ไม่ต้องมี normalizeRole)
  const isKnownRole = /^(admin|supervisor|developer|dev|user|แอดมิน|หัวหน้า|นักพัฒนา|ผู้ใช้)$/i.test(maybeRole);
  const role = isKnownRole ? maybeRole.toLowerCase() : '';

  const nameTokens = isKnownRole ? parts.slice(1, -1) : parts.slice(1);
  const realName = nameTokens.join(' ');

  return { username, realName, role };
}


function parseAssign(text){
  const m = text.match(/^@([^:：]+)[:：]\s*([\s\S]+)$/);
  if (!m) return null;
  const assigneeName = m[1].trim();
  let body = m[2].trim();
  body = body.replace(/;/g, '|'); // รองรับ ; แทน |

  let deadline = '', note = '';
  body = body.replace(/\|\s*(กำหนดส่ง|due|deadline)[:：]\s*([^\|]+)\s*/i, (_, __, v)=>{ deadline = v.trim(); return ''; });
  body = body.replace(/\|\s*(note|โน้ต|หมายเหตุ)[:：]\s*([^\|]+)\s*/i, (_, __, v)=>{ note = v.trim(); return ''; });

  // แท็กเร่งด่วน/ปกติ
  const urgentInText = /\b(urgent|ด่วน|รีบ)\b/i.test(body) || /\b(urgent|ด่วน|รีบ)\b/i.test(note);
  const normalInText = /\b(normal|ไม่รีบ)\b/i.test(body) || /\b(normal|ไม่รีบ)\b/i.test(note);
  // ใน parseAssign หลังคำนวณ urgentInText/normalInText แล้ว ใส่บรรทัดลบคำออกจาก body
  if (urgentInText) {
    note = note ? `[URGENT] ${note}` : `[URGENT]`;
    body = body.replace(/(ด่วน(ที่สุด|สุด)?|urgent)/ig, ' ');
  }
  if (!urgentInText && normalInText) {
    // เก็บคำเดิมเป็นโน้ต
    note = note ? (note + ' ไม่รีบ') : 'ไม่รีบ';
    body = body.replace(/(ไม่รีบ(?:นะ)?|normal|ค่อยทำ)/ig, ' ');
  }

  // เก็บกวาดฟิลเลอร์
  body = body
    .replace(/(?:^|\s)(นะ|ด้วย)(?=\s|$)/g, ' ')
    .replace(/\s+\|+\s*$/, '')
    .trim();

  const detail = body.trim().replace(/\s+\|+\s*$/,'');
  const nat = parseNaturalDue(deadline);
  return { assigneeName, detail, deadline: nat || deadline, note };
}

function parseStatus(text){
  const m1 = text.match(/^done\s+(TASK_[A-Za-z0-9]+)$/i);
  const m2 = text.match(/^กำลังดำเนินการ\s+(TASK_[A-Za-z0-9]+)$/i);
  if (m1) return { status:'done',  taskId:m1[1] };
  if (m2) return { status:'doing', taskId:m2[1] };
  return null;
}
function parseSetDeadline(text){
  const m = text.match(/^ตั้งกำหนดส่ง\s+(TASK_[A-Za-z0-9]+)[:：]\s*(.+)$/i);
  if (!m) return null;
  return { taskId:m[1], deadline:m[2].trim() };
}
function parseAddNote(text){
  const m = text.match(/^เพิ่มโน้ต\s+(TASK_[A-Za-z0-9]+)[:：]\s*(.+)$/i);
  if (!m) return null;
  return { taskId:m[1], note:m[2].trim() };
}

// --- Edit commands parsers ---
function parseReassign(text){
  const m = text.match(/^เปลี่ยนผู้รับ\s+(TASK_[A-Za-z0-9]+)[:：]\s*@?([^\s]+)\s*$/i);
  if (!m) return null;
  return { taskId: m[1], mention: m[2].trim() };
}
function parseEditDeadline(text){
  const m = text.match(/^แก้เดดไลน์\s+(TASK_[A-Za-z0-9]+)[:：]\s*(.+)$/i);
  if (!m) return null;
  return { taskId: m[1], deadline: m[2].trim() };
}
function parseEditDetail(text){
  const m = text.match(/^แก้รายละเอียด\s+(TASK_[A-Za-z0-9]+)[:：]\s*(.+)$/i);
  if (!m) return null;
  return { taskId: m[1], detail: m[2].trim() };
}

function parseRemind(text){
  const m = text.match(/^(เตือน|remind)\s+(TASK_[A-Za-z0-9]+)$/i);
  return m ? { taskId: m[2] } : null;
}


// แปลงสตริง deadline เป็น timestamp (ms)
// รองรับ ISO / "dd/MM/yyyy" / "dd/MM/yyyy HH:mm"
function parseDeadline(str){
  if (!str) return NaN;
  const s = String(str).trim();

  // 1) ISO หรือรูปแบบที่ Date.parse รองรับอยู่แล้ว
  const t1 = Date.parse(s);
  if (!Number.isNaN(t1)) return t1;

  // 2) dd/MM/yyyy [HH:mm]
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const dd = Number(m[1]), MM = Number(m[2]) - 1, yyyy = Number(m[3]);
    const hh = m[4] ? Number(m[4]) : 0, min = m[5] ? Number(m[5]) : 0;
    return new Date(yyyy, MM, dd, hh, min, 0).getTime();
  }
  return NaN;
}


// ── Pager (ตาราง Flex + ปุ่มเลื่อนหน้า)
const pagerStore = new Map(); // key: userId → { key, rows, page, title, pageSize }
const PAGE_SIZE = 8;

function renderFlexTable(title, headers, rowsPage) {
  const header = {
    type: 'box',
    layout: 'horizontal',
    contents: headers.map(h => ({
      type: 'text',
      text: String(h || '-'),
      size: 'sm',
      weight: 'bold',
      color: '#555555',
      flex: 1,
      wrap: true
    }))
  };

  const lines = rowsPage.map((row, i) => {
    const cols = Array.isArray(row)
      ? row
      : [row?.date, row?.title, row?.due, row?.status];

    return {
      type: 'box',
      layout: 'vertical',
      margin: 'sm',
      backgroundColor: i % 2 === 0 ? '#F9F9F9' : '#FFFFFF',
      paddingAll: '4px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: String(cols[0] ?? '-'), size: 'xs', flex: 2, color: '#888888' },
            { type: 'text', text: String(cols[1] ?? '-'), size: 'sm', flex: 8, wrap: true, weight: 'bold' }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: String(cols[2] ?? '-'), size: 'xs', flex: 5, color: '#666666' },
            { type: 'text', text: String(cols[3] ?? '-'), size: 'xs', flex: 3, align: 'end', color: '#0066CC' }
          ]
        }
      ]
    };
  });

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'text', text: title, weight: 'bold', size: 'md' }]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [header, { type: 'separator', margin: 'sm' }, ...lines]
    }
  };
}


async function startPager(userId, replyToken, key, allRows, title){
  const state = { key, rows: allRows, page: 0, title, pageSize: PAGE_SIZE };
  pagerStore.set(userId, state);
  await sendPage(userId, replyToken);
}
async function sendPage(userId, replyToken){
  const st = pagerStore.get(userId); if (!st) return;

  const total = st.rows.length;
  const start = st.page * st.pageSize;
  const end   = Math.min(start + st.pageSize, total);
  const pageRows = st.rows.slice(start, end);
  const totalPages = Math.max(1, Math.ceil(Math.max(0,total)/st.pageSize));
  const title = `${st.title} — หน้า ${st.page+1}/${totalPages}`;

  // เลือกหัวคอลัมน์ให้เหมาะกับ key
  let headers;
  switch (st.key) {
    case 'users':
      headers = ['อัปเดต', 'ผู้ใช้ (บทบาท)', 'สถานะ', '-'];
      break;
    case 'mine_assigned':
      headers = ['วันที่', 'รายการ (#ID)', 'ผู้รับ', 'สถานะ'];
      break;
    case 'mine_pending':
    case 'today':
    case 'mine_range':
      headers = ['วันที่', 'รายการ (#ID)', 'กำหนดส่ง', 'สถานะ'];
      break;
    default:
      headers = ['วันที่', 'รายการ', 'กำหนดส่ง', 'สถานะ'];
  }

  // ปุ่มเลื่อนหน้า
  const quick = [];
  if (st.page > 0) quick.push({ type:'action', action:{ type:'message', label:'← ก่อนหน้า', text:'← ก่อนหน้า' }});
  if (st.page < totalPages-1) quick.push({ type:'action', action:{ type:'message', label:'ถัดไป →', text:'ถัดไป →' }});

  await replyFlex(replyToken, renderFlexTable(title, headers, pageRows), quick);
}

async function turnPage(userId, replyToken, delta){
  const st = pagerStore.get(userId); if (!st) return;
  const total = st.rows.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(0,total)/st.pageSize));
  st.page = Math.min(totalPages-1, Math.max(0, st.page + delta));
  await sendPage(userId, replyToken);
}

// ========== Draft assignment store ==========
const draftAssign = new Map(); // key: userId -> { taskId, assign, assignee }

// ── Webhook
app.post('/webhook/line', async (req,res)=>{
  try { assertLineSignature(req); } catch(e){ return res.status(400).end(); }
  res.status(200).end();

  try {
    const body = req.body;
    if (!body || !Array.isArray(body.events)) return;

    for (const ev of body.events) {
      const userId = ev.source && ev.source.userId;
      // รองรับ postback presets
      if (ev.type === 'postback') {
        const data = String(ev.postback?.data || '');
        if (data.startsWith('preset=')) {
          const cur = assignPreset.get(userId) || {};
          if (data === 'preset=urgent') {
            cur.urgent = true;
            assignPreset.set(userId, cur);
            await reply(ev.replyToken, 'ตั้งค่าเร่งด่วนสำหรับคำสั่งถัดไปแล้ว ✅');
          } else if (data === 'preset=due_today_1730') {
            cur.due = parseNaturalDue('วันนี้ 17:30');
            assignPreset.set(userId, cur);
            await reply(ev.replyToken, 'ตั้งเดดไลน์ “วันนี้ 17:30” สำหรับคำสั่งถัดไปแล้ว ✅');
          } else if (data === 'preset=due_tmrw_0900') {
            cur.due = parseNaturalDue('พรุ่งนี้ 09:00');
            assignPreset.set(userId, cur);
            await reply(ev.replyToken, 'ตั้งเดดไลน์ “พรุ่งนี้ 09:00” สำหรับคำสั่งถัดไปแล้ว ✅');
          } else {
            await reply(ev.replyToken, 'ไม่รู้จักตัวช่วยนี้');
          }
          continue;
        }
      }

      if (ev.type!=='message' || ev.message.type!=='text') continue;
      const text   = (ev.message.text || '').trim();

      // ปุ่มเลื่อนหน้า
      if (text === 'ถัดไป →')   { await turnPage(userId, ev.replyToken, +1); continue; }
      if (text === '← ก่อนหน้า') { await turnPage(userId, ev.replyToken, -1); continue; }

      // ลงทะเบียน (กดปุ่ม)
      if (text === 'ลงทะเบียน') {
        const u = await callAppsScript('get_user', { user_id:userId });
        if (u.found) {
          await linkRichMenuToUser(userId, RICHMENU_ID_MAIN);
          const name = u.user?.real_name || u.user?.username || '-';
          const role = roleLabel(u.user?.role);
          await reply(ev.replyToken, `บัญชีนี้ลงทะเบียนแล้ว ✅\nชื่อ: ${name}\nบทบาท: ${role}\nหากต้องการแก้ไขสิทธิ์ติดต่อผู้ดูแลระบบครับ`);
        } else {
          await linkRichMenuToUser(userId, RICHMENU_ID_PREREG);
          await reply(ev.replyToken,
            'พิมพ์ลงทะเบียนแบบสั้นๆ ได้เลย:\n' +
            '• ลงทะเบียน: username ชื่อ–นามสกุล [บทบาท]\n' +
            '   เช่น  ลงทะเบียน test ทดสอบ ระบบ user\n'    
          );

        }
        continue;
      }

      // ลงทะเบียนจริง (พิมพ์สตริงลงทะเบียนแบบหลวม)
      {
        const p = parseRegister(text);
        if (p) {
          const existed = await callAppsScript('get_user', { user_id:userId });
          if (existed && existed.found) {
            const name = existed.user?.real_name || existed.user?.username || '';
            const role = roleLabel(existed.user?.role);
            await linkRichMenuToUser(userId, RICHMENU_ID_MAIN);
            await reply(ev.replyToken, `บัญชีนี้ลงทะเบียนไว้แล้ว ✅\nชื่อ: ${name}\nบทบาท: ${role}`);
          } else if (!p.username || !p.realName) {
            await reply(ev.replyToken, 'รูปแบบ: ลงทะเบียน: ชื่อผู้ใช้,ชื่อ–นามสกุล[,บทบาท]\nตัวอย่าง: ลงทะเบียน: test,ทดสอบ ระบบ,user');
          } else {
            await callAppsScript('upsert_user', {
              user_id: userId,
              username: p.username,
              real_name: p.realName,
              role: normalizeRole(p.role || 'user'),
              status: 'Active'
            });
            await linkRichMenuToUser(userId, RICHMENU_ID_MAIN);
            await reply(ev.replyToken, `ลงทะเบียนสำเร็จ ✅\nยินดีต้อนรับคุณ ${p.realName} (${roleLabel(normalizeRole(p.role))})`);
          }
          continue;
        }
      }


      // ปุ่มเมนู: สั่งงาน → แสดงตัวอย่าง (จัดบรรทัดอ่านง่ายเหมือน "ช่วยเหลือ")
      if (text === 'สั่งงาน') {
        const r = await callAppsScript('list_users', {});
        const users = (r.users||[]).filter(u => String(u.status||'Active').toLowerCase()==='active');

        const sample = users.slice(0, 15).map(u => {
          const handle  = u.username ? `@${u.username}` : `@${shortId(u.user_id)}`;
          const roleTxt = roleLabel(u.role);
          const real    = u.real_name ? ` – ${u.real_name}` : '';
          return `• ${handle} (${roleTxt})${real}`;
        });
        const more = users.length>15 ? `… และอีก ${users.length-15} คน` : '';

        const helpLines = [
          '📝 สั่งงาน — พิมพ์แบบนี้',
          '',
          'ตัวอย่าง (พิมพ์เล็ก/ใหญ่ และเว้นวรรคได้):',
          '• @po ปรับรายงาน พรุ่งนี้ 09:00',
          '• @test ขอทำป้ายหน้าร้าน ก่อนบ่าย 3 นะ',
          '• @po ทำ rich menu วันนี้ ด่วน',
          '',
          'เกร็ดสั้น ๆ:',
          '• ไม่ใส่เวลา → ใช้ 17:30 อัตโนมัติ',
          '• "ก่อนบ่าย 3" = วันนี้ 15:00',
          '• ใส้คำว่า ด่วน/urgent → ติดแท็ก [URGENT]',
          '',
          'ผู้รับงานในระบบ (บางส่วน):',
          ...sample,
          more
        ].filter(Boolean);

        await reply(ev.replyToken, helpLines.join('\n'));
        continue;
      }




      // ปุ่มเมนู: ดูผู้ใช้งานทั้งหมด (สรุป)
      if (text === 'ดูผู้ใช้งานทั้งหมด') {
        const r = await callAppsScript('list_users', {});
        const users = r.users || [];
        if (!users.length) { await reply(ev.replyToken, 'ยังไม่มีผู้ใช้ในระบบ'); continue; }
        users.sort((a,b) =>
          roleRank(a.role) - roleRank(b.role) ||
          String(a.real_name || a.username || '').localeCompare(String(b.real_name || b.username || ''))
        );
        const bubbles = users.slice(0, 10).map(u => renderUserCard({
          name: u.real_name || u.username || '-',
          role: (u.role || 'User'),
          status: (u.status || 'Active'),
          updated: (u.updated_at || '').slice(0,10)
        }));

        await replyFlexMany(ev.replyToken, bubbles, []);
        continue;
      }


      // ปุ่มเมนู: ดูงานค้างทั้งหมด (ของฉัน)
      if (text === 'ดูงานค้างทั้งหมด') {
        const r = await callAppsScript('list_tasks', { assignee_id: userId });
        const tasks = (r.tasks || []).filter(t => ['pending','doing'].includes(String(t.status||'')));
        tasks.sort((a,b) =>
          statusRank(a.status) - statusRank(b.status) ||
          compareDue(a,b) ||
          String(b.updated_date||'').localeCompare(String(a.updated_date||''))
        );

        if (!tasks.length) { await reply(ev.replyToken, 'ไม่มีงานค้าง 🎉'); continue; }

        const bubbles = tasks.slice(0, 10).map(t => renderTaskCard({
          id: t.task_id,
          title: `${clip(t.task_detail, 80)}`,
          date: (t.updated_date || t.created_date || '').slice(0,10),
          due: t.deadline ? t.deadline.slice(0,16).replace('T',' ') : '-',
          status: t.status,
          assignee: t.assignee_name || '',
          assigner: t.assigner_name || ''
        }));

        await replyFlexMany(ev.replyToken, bubbles, []);
        continue;
      }

      // ปุ่มเมนู: งานที่ฉันสั่ง (เรียงตาม URGENT → เลยเดดไลน์ → ใกล้กำหนด → doing → pending)
      if (/^(ดู)?งานที่ฉันสั่ง$/.test(text)) {
        const r = await callAppsScript('list_tasks', {});
        const mine = (r.tasks || []).filter(t => t.assigner_id === userId);

        if (!mine.length) { await reply(ev.replyToken, 'ยังไม่มีงานที่คุณสั่ง'); continue; }

        const nowMs = Date.now();
        const prio = t => {
          const urgent = /\[urgent\]|ด่วน/i.test(`${t.note||''} ${t.task_detail||''}`) ? 1 : 0;
          const dueMs  = parseDeadline(t.deadline);
          const overdue = !Number.isNaN(dueMs) && dueMs < nowMs && String(t.status||'').toLowerCase()!=='done' ? 1 : 0;
          const dueScore = Number.isNaN(dueMs) ? Number.POSITIVE_INFINITY : dueMs;
          const st = String(t.status||'').toLowerCase();
          const stOrder = (st==='doing') ? 0 : (st==='pending'?1:2);
          return [-urgent, -overdue, dueScore, stOrder];
        };
        mine.sort((a,b)=>{ const A=prio(a), B=prio(b); for(let i=0;i<A.length;i++){ if(A[i]<B[i]) return -1; if(A[i]>B[i]) return 1; } return 0; });

        const bubbles = mine.slice(0, 10).map(t => renderTaskCard({
          id: t.task_id,
          title: `${clip(t.task_detail, 80)}`,
          date: (t.updated_date || t.created_date || '').slice(0,10),
          due: t.deadline ? t.deadline.slice(0,16).replace('T',' ') : '-',
          status: t.status,
          assignee: t.assignee_name || '',
          assigner: t.assigner_name || ''
        }));

        await replyFlexMany(ev.replyToken, bubbles, []);
        continue;
      }



      // ปุ่มเมนู: งานคงเหลือวันนี้ / งานของฉันวันนี้  → แสดงแบบการ์ด
      if (text === 'งานคงเหลือวันนี้' || text === 'งานของฉันวันนี้') {
        const today = new Date();
        const yyyy = today.getFullYear(), mm = today.getMonth(), dd = today.getDate();
        const startMs = new Date(yyyy, mm, dd, 0, 0, 0).getTime();
        const endMs   = new Date(yyyy, mm, dd, 23, 59, 59).getTime();

        const r = await callAppsScript('list_tasks', { assignee_id: userId });

        // เงื่อนไข: ยังไม่เสร็จ และ (เดดไลน์วันนี้ หรือ ไม่มีเดดไลน์)
        const list = (r.tasks || []).filter(t => {
          const st = String(t.status || '').toLowerCase();     // pending/doing/done
          const dueMs = parseDeadline(t.deadline);
          const hasDue = !Number.isNaN(dueMs);
          const isToday = hasDue && dueMs >= startMs && dueMs <= endMs;
          const noDue   = !hasDue;
          return st !== 'done' && (isToday || noDue);
        });
        list.sort((a,b) =>
          compareDue(a,b) ||
          statusRank(a.status) - statusRank(b.status)
        );


        if (!list.length) { await reply(ev.replyToken, 'วันนี้ไม่มีงานคงเหลือ 🎉'); continue; }

        // แปลงเป็นการ์ด (สูงสุด 10 ใบ/ข้อความ)
        const total = list.length;
        const bubbles = list.slice(0, 10).map(t => renderTaskCard({
          id: t.task_id,
          title: `${clip(t.task_detail, 80)}`,
          date: (t.updated_date || t.created_date || '').slice(0,10),
          due: t.deadline ? t.deadline.slice(0,16).replace('T',' ') : '-',
          status: t.status,
          assignee: t.assignee_name || '',
          assigner: t.assigner_name || ''
        }));

        // แจ้งผู้ใช้หากมีมากกว่า 10
        const quick = [];
        if (total > 10) {
          quick.push({ type:'action', action:{ type:'message', label:`แสดง 10 จาก ${total} รายการ`, text:'ช่วยเหลือ' }});
        }

        await replyFlexMany(ev.replyToken, bubbles, quick);
        continue;
      }



      // ดูงานของฉันทั้งหมด: dd/MM/yyyy - dd/MM/yyyy
      const range = text.match(/^ดูงานของฉันทั้งหมด[:：]\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})$/);
      if (range) {
        const [_, d1, d2] = range;
        const fromISO = new Date(d1.split('/').reverse().join('-') + 'T00:00:00').toISOString();
        const toISO   = new Date(d2.split('/').reverse().join('-') + 'T23:59:59').toISOString();

        const r = await callAppsScript('list_tasks', { assignee_id: userId, from_date: fromISO, to_date: toISO });
        const arr = (r.tasks || []).slice().sort((a,b) =>
          statusRank(a.status) - statusRank(b.status) || compareDue(a,b)
        );
        const rows2d = arr.map(t => ([
          (t.updated_date || t.created_date || '').slice(0,10),
          `${clip(t.task_detail, 40)}  #${shortId(t.task_id)}`,
          (t.deadline ? t.deadline.slice(0,16).replace('T',' ') : '-'),
          String(t.status||'').toUpperCase()
        ]));
        if (!rows2d.length) { await reply(ev.replyToken, 'ไม่พบงานในช่วงที่ระบุ'); continue; }
        await startPager(userId, ev.replyToken, 'mine_range', rows2d, `งานของฉัน (${d1} - ${d2})`);
        continue;
      }

      // ช่วยเหลือ (ฉบับสั้น อ่านง่ายบนมือถือ)
      if (text === 'ช่วยเหลือ') {
        const help = [
          'วิธีใช้งาน (สั้นๆ)',
          '',
          'ลงทะเบียน',
          '• ลงทะเบียน po ปอ อนุชา user',
          '',
          'สั่งงาน',
          '• @po ปรับรายงาน พรุ่งนี้ 09:00',
          '• @test ทำป้าย ก่อนบ่าย 3',
          '• @po: งาน',
          '  | กำหนดส่ง: 12/03 14:00',
          '  | note: ไม่รีบ',
          '',
          'เปลี่ยนสถานะ',
          '• done TASK_xxxxxxxx',
          '• กำลังดำเนินการ TASK_xxxxxxxx',
          '',
          'เดดไลน์ / โน้ต',
          '• ตั้งกำหนดส่ง TASK_xxxxxxxx: พรุ่งนี้ 17:30',
          '• เพิ่มโน้ต TASK_xxxxxxxx: ขอไฟล์ ai',
          '',
          'ดูรายการ',
          '• ดูงานค้างทั้งหมด',
          '• งานที่ฉันสั่ง',
          '• งานของฉันวันนี้',
          '• ดูผู้ใช้งานทั้งหมด',
          '',
          'เมนู / แอดมิน',
          '• รีเซ็ตเมนู',
          '• ติดต่อแอดมิน  (พิมพ์ @ชื่อ ข้อความ)'
        ].join('\n');
        await reply(ev.replyToken, help);
        continue;
      }

      // รีเซ็ตเมนู (เฉพาะผู้ใช้คนนี้) — ใช้ได้ทุกคน
      if (/^(รีเซ็ตเมนู|ตั้งเมนูแรก|รีเซ็ตเมนูของฉัน)$/.test(text)) {
        try {
          await linkRichMenuToUser(userId, RICHMENU_ID_PREREG);
          await reply(ev.replyToken, 'เปลี่ยนเมนูของคุณกลับเป็นเมนูเริ่มต้นแล้ว ✅');
        } catch (e) {
          console.error('RESET_MENU_SELF_ERR', e);
          await reply(ev.replyToken, 'เปลี่ยนเมนูไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        }
        continue;
      }



      // ติดต่อแอดมิน → แสดงรายชื่อ + วิธีส่งข้อความ
      if (text === 'ติดต่อแอดมิน') {
        try {
          const r = await callAppsScript('list_users', {});
          const admins = (r.users||[]).filter(u =>
            ['admin','supervisor'].includes(String(u.role||'').toLowerCase())
          );
          if (!admins.length) { await reply(ev.replyToken, 'ยังไม่มีแอดมินในระบบ'); continue; }

          const lines = admins.slice(0, 15).map(u =>
            `• @${u.username || '-'}${u.real_name ? ` – ${u.real_name}` : ''}`
          );
          const more = admins.length>15 ? `\n…และอีก ${admins.length-15} คน` : '';

          const help = 
      `ส่งข้อความถึงแอดมิน:
      พิมพ์ @username ข้อความ

      ตัวอย่าง:
      @po ขอสิทธิ์เข้าถึงชีท

      รายชื่อแอดมิน:
      ${lines.join('\n')}${more}`;

          await reply(ev.replyToken, help);
        } catch (e) {
          console.error('CONTACT_ADMIN_LIST_ERR', e);
          await reply(ev.replyToken, 'ดึงรายชื่อแอดมินไม่สำเร็จ ลองใหม่อีกครั้ง');
        }
        continue;
      }



      // ตั้งกำหนดส่ง
      {
        const dl = parseSetDeadline(text);
        if (dl) {
          const t = await updateTaskFields(dl.taskId, { deadline: dl.deadline });
          await reply(ev.replyToken, `ตั้งกำหนดส่งให้ ${dl.taskId} แล้ว\nเดดไลน์: ${t.deadline}`);
          continue;
        }
      }
      // เพิ่มโน้ต
      {
        const an = parseAddNote(text);
        if (an) {
          const cur = await getTaskById(an.taskId);
          const newNote = [cur?.note, an.note].filter(Boolean).join(' | ');
          await updateTaskFields(an.taskId, { note: newNote });
          await reply(ev.replyToken, `เพิ่มโน้ตให้ ${an.taskId} แล้ว\nโน้ต: ${newNote}`);
          continue;
        }
      }
      // เปลี่ยนผู้รับ (เฉพาะผู้สั่งงานเท่านั้น)
      {
        const p = parseReassign(text);
        if (p) {
          const t = await getTaskById(p.taskId);
          if (!t) { await reply(ev.replyToken, 'ไม่พบงานนั้นครับ'); continue; }
          if (t.assigner_id !== userId) { await reply(ev.replyToken, 'คำสั่งนี้ใช้ได้เฉพาะผู้สั่งงานครับ'); continue; }

          const newAss = await resolveAssignee(p.mention);
          if (!newAss) { await reply(ev.replyToken, 'ไม่พบผู้รับใหม่ กรุณาใช้ @username'); continue; }

          const prevAssId = t.assignee_id;
          const prevAssName = t.assignee_name;

          const merged = await updateTaskFields(p.taskId, {
            assignee_id: newAss.user_id || '',
            assignee_name: newAss.username || newAss.real_name || p.mention,
            updated_date: new Date().toISOString()
          });

          await reply(ev.replyToken, `เปลี่ยนผู้รับของ ${p.taskId} แล้ว → ${merged.assignee_name}`);

          // แจ้งผู้เกี่ยวข้อง
          let actor = 'Unknown';
          try {
            const gu = await callAppsScript('get_user', { user_id: userId });
            actor = gu?.user?.username || gu?.user?.real_name || (await getDisplayName(userId)) || 'Unknown';
          } catch (_) { actor = (await getDisplayName(userId)) || 'Unknown'; }

          // แจ้งผู้รับเก่า
          if (prevAssId && prevAssId !== newAss.user_id) {
            await pushText(prevAssId, `งาน ${p.taskId} ถูกโอนไปให้ ${merged.assignee_name} โดย ${actor}\nรายละเอียด: ${t.task_detail||'-'}`);
          }
          // แจ้งผู้รับใหม่
          if (newAss.user_id) {
            await pushText(newAss.user_id, `คุณได้รับมอบหมายงาน ${p.taskId} จาก ${actor}\nรายละเอียด: ${t.task_detail||'-'}` + (merged.deadline?`\nกำหนดส่ง: ${merged.deadline.replace('T',' ')}`:''));
          }
          continue;
        }
      }

      // แก้เดดไลน์ (alias ของ "ตั้งกำหนดส่ง")
      {
        const p = parseEditDeadline(text);
        if (p) {
          const t = await getTaskById(p.taskId);
          if (!t) { await reply(ev.replyToken, 'ไม่พบงานนั้นครับ'); continue; }
          if (t.assigner_id !== userId) { await reply(ev.replyToken, 'คำสั่งนี้ใช้ได้เฉพาะผู้สั่งงานครับ'); continue; }

          const nat = parseNaturalDue(p.deadline) || p.deadline;
          const merged = await updateTaskFields(p.taskId, { deadline: nat, updated_date: new Date().toISOString() });
          await reply(ev.replyToken, `อัปเดตเดดไลน์ ${p.taskId} เป็น ${merged.deadline.replace('T',' ')}`);

          if (t.assignee_id) {
            await pushText(t.assignee_id, `เดดไลน์งาน ${p.taskId} ถูกอัปเดตเป็น ${merged.deadline.replace('T',' ')}\nรายละเอียด: ${t.task_detail||''}`);
          }
          continue;
        }
      }

      // แก้รายละเอียดงาน
      {
        const p = parseEditDetail(text);
        if (p) {
          const t = await getTaskById(p.taskId);
          if (!t) { await reply(ev.replyToken, 'ไม่พบงานนั้นครับ'); continue; }
          if (t.assigner_id !== userId) { await reply(ev.replyToken, 'คำสั่งนี้ใช้ได้เฉพาะผู้สั่งงานครับ'); continue; }

          const merged = await updateTaskFields(p.taskId, { task_detail: p.detail, updated_date: new Date().toISOString() });
          await reply(ev.replyToken, `แก้รายละเอียด ${p.taskId} แล้ว`);

          if (t.assignee_id) {
            await pushText(t.assignee_id, `งาน ${p.taskId} มีการแก้รายละเอียด:\n${merged.task_detail}`);
          }
          continue;
        }
      }

      // เตือนผู้รับให้ทำงาน (ส่งเป็นการ์ด)
      {
        const rm = parseRemind(text);
        if (rm) {
          const t = await getTaskById(rm.taskId);
          if (!t) { await reply(ev.replyToken, 'ไม่พบบันทึกงานนั้นครับ'); continue; }

          // อนุญาตเฉพาะผู้สั่งงาน
          if (userId !== t.assigner_id) { await reply(ev.replyToken, 'เฉพาะผู้สั่งงานเท่านั้นที่ส่งเตือนได้'); continue; }
          if (!t.assignee_id) { await reply(ev.replyToken, 'รายการนี้ไม่มี LINE ID ของผู้รับ จึงส่งเตือนไม่ได้'); continue; }

          // ชื่อผู้ส่งเตือน (username ก่อน)
          let actor = 'Unknown';
          try {
            const gu = await callAppsScript('get_user', { user_id: userId });
            actor = gu?.user?.username || gu?.user?.real_name || (await getDisplayName(userId)) || 'Unknown';
          } catch (_) {
            actor = (await getDisplayName(userId)) || 'Unknown';
          }

          // การ์ดถึงผู้รับ (ใส่ปุ่มอัปเดตสถานะ)
          const bubble = renderTaskCard({
            id: t.task_id,
            title: clip(t.task_detail, 80),
            date: (t.updated_date || t.created_date || '').slice(0,10),
            due: t.deadline ? t.deadline.slice(0,16).replace('T',' ') : '-',
            status: t.status,
            assignee: t.assignee_name || '',
            assigner: actor,      // ชื่อผู้ส่งเตือน
            showId: true,
            showStatusButtons: true
          });

          await pushFlex(t.assignee_id, bubble, []);
          await reply(ev.replyToken, 'ส่งการ์ดเตือนให้ผู้รับแล้ว ✅');
          continue;
        }
      }

      // ยืนยัน/ยกเลิกรายการร่าง (รองรับแบบไม่ใส่/ใส่ TMP_ID)
      {
        const mOk = text.match(/^ยืนยันมอบหมาย(?:\s+(TMP_[A-Za-z0-9]+))?$/);
        const mNo = text.match(/^ยกเลิกมอบหมาย(?:\s+(TMP_[A-Za-z0-9]+))?$/);

        if (mOk || mNo) {
          const tmpIdFromText = mOk?.[1] || mNo?.[1];
          const draft = draftAssign.get(userId); // มีได้คนละ 1 รายการต่อผู้ใช้

          if (!draft) {
            await reply(ev.replyToken, 'ไม่พบรายการร่าง');
            continue;
          }
          // ถ้าผู้ใช้พิมพ์ TMP_ID มา แต่ไม่ตรงกับของตัวเอง → ปัดตก
          if (tmpIdFromText && tmpIdFromText !== draft.taskId) {
            await reply(ev.replyToken, 'ไม่พบรายการร่าง');
            continue;
          }

          // ยกเลิก
          if (mNo) {
            draftAssign.delete(userId);
            await reply(ev.replyToken, 'ยกเลิกร่างแล้ว');
            continue;
          }

          // ยืนยัน → สร้างงานจริง
          draftAssign.delete(userId);
          const taskId = 'TASK_' + crypto.randomBytes(4).toString('hex');

          // ผู้สั่ง = username ก่อน (fallback real_name → displayName)
          let assignerName = 'Unknown';
          try {
            const gu = await callAppsScript('get_user', { user_id: userId });
            assignerName = gu?.user?.username || gu?.user?.real_name || (await getDisplayName(userId)) || 'Unknown';
          } catch(_) {
            assignerName = (await getDisplayName(userId)) || 'Unknown';
          }

          await callAppsScript('upsert_task', {
            task_id: taskId,
            assigner_name: assignerName,
            assigner_id: userId,
            assignee_name: draft.assignee.username || draft.assign.assigneeName, // บันทึกเป็น username
            assignee_id: draft.assignee.user_id || '',
            task_detail: draft.assign.detail,
            status: 'pending',
            deadline: draft.assign.deadline || '',
            note: draft.assign.note || '',
            created_date: new Date().toISOString(),
            updated_date: new Date().toISOString(),
          });

          await reply(
            ev.replyToken,
            `มอบหมายงานแล้ว ✅\n#${shortId(taskId)} ${draft.assign.detail}\nผู้รับ: ${draft.assignee.username}` +
            (draft.assign.deadline ? `\nกำหนดส่ง: ${draft.assign.deadline.replace('T',' ')}` : '')
          );

          if (draft.assignee.user_id) {
            await pushText(
              draft.assignee.user_id,
              `คุณได้รับงานใหม่จาก ${assignerName}\nID: ${taskId}\nรายละเอียด: ${draft.assign.detail}` +
              (draft.assign.deadline ? `\nกำหนดส่ง: ${draft.assign.deadline.replace('T',' ')}` : '')
            );
          }
          continue;
        }
      }

      // DM ถึงแอดมิน: "@username ข้อความ" (ไม่มีเครื่องหมาย : หรือ ：)
      {
        const m = text.match(/^@([^\s:：]+)\s+([\s\S]+)$/);
        if (m && !/[：:]/.test(text)) {
          const targetKey = m[1].trim().toLowerCase();
          const message   = m[2].trim();

          // หาเฉพาะ admin/supervisor
          const r = await callAppsScript('list_users', {});
          const admins = (r.users||[]).filter(u =>
            ['admin','supervisor'].includes(String(u.role||'').toLowerCase())
          );
          const target = admins.find(u =>
            String(u.username||'').toLowerCase() === targetKey ||
            String(u.real_name||'').toLowerCase() === targetKey
          );

          // ถ้าไม่ใช่แอดมิน → ปล่อยผ่านให้ parser อื่นจัดการ (เช่น สั่งงาน)
          if (!target || !target.user_id) {
            // do nothing; let the next handlers run
          } else {
            // ชื่อผู้ส่ง
            let sender = '';
            try {
              const gu = await callAppsScript('get_user', { user_id: userId });
              sender = gu?.user?.username || gu?.user?.real_name || (await getDisplayName(userId)) || userId;
            } catch (_) {
              sender = (await getDisplayName(userId)) || userId;
            }

            await pushText(target.user_id, `📨 ข้อความถึงแอดมินจาก ${sender}\n${message}`);
            await reply(ev.replyToken, 'ส่งข้อความถึงแอดมินแล้ว ✅');
            continue;
          }
        }
      }





      // มอบหมายงาน → แสดงการ์ด Preview ก่อนยืนยัน (ซ่อนปุ่มสถานะ + ไม่แสดง TMP ID)
      {
        let assign = parseAssign(text);         // แบบฟอร์ม @user: งาน | กำหนดส่ง: ...
        if (!assign) assign = parseAssignLoose(text);  // แบบภาษาพูด @user งาน ... วันจันทร์หน้า
        if (assign) {
          const assignee = await resolveAssignee(assign.assigneeName);

          if (!assignee) {
            const r = await callAppsScript('list_users', {});
            const candidates = (r.users||[]).filter(u =>
              (u.username||'').toLowerCase().includes(assign.assigneeName.toLowerCase()) ||
              (u.real_name||'').toLowerCase().includes(assign.assigneeName.toLowerCase())
            ).slice(0,13);

            if (candidates.length) {
              const qr = candidates.map(u => ({
                type:'action',
                action:{ type:'message', label:`@${u.username}`, text:`@${u.username}: ${assign.detail}` + (assign.deadline?` | กำหนดส่ง: ${assign.deadline}`:'') + (assign.note?` | note: ${assign.note}`:'') }
              }));
              await reply(ev.replyToken, 'ไม่ชัดเจนว่าหมายถึงใคร เลือกจากด้านล่างได้เลย:', qr);
            } else {
              await reply(ev.replyToken,'ไม่พบผู้รับ กรุณาใช้ @username');
            }
            continue;
          }

          const tmpId = 'TMP_' + crypto.randomBytes(3).toString('hex');
          draftAssign.set(userId, { taskId: tmpId, assign, assignee });

          // การ์ด Preview แบบไม่แสดง ID และมีแค่ปุ่ม "ยืนยัน/ยกเลิก"
          const preview = {
            type: 'bubble',
            body: {
              type: 'box', layout: 'vertical', spacing: 'sm',
              contents: [
                { type: 'text', text: clip(assign.detail, 80), weight: 'bold', wrap: true },
                {
                  type: 'box', layout: 'vertical', spacing: 'xs',
                  contents: [
                    { type: 'text', text: `อัปเดต: ${new Date().toISOString().slice(0,10)}`, size: 'xs', color: '#777777' },
                    { type: 'text', text: `กำหนดส่ง: ${assign.deadline ? assign.deadline.replace('T',' ') : '-'}`, size: 'xs', color: '#555555' },
                    { type: 'text', text: `ผู้รับ: ${assignee.username}`, size: 'xs', color: '#555555' },
                    { type: 'text', text: `ผู้สั่ง: (คุณ)`, size: 'xs', color: '#555555' }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [{ type: 'text', text: 'PENDING', size: 'xs', color: '#9e9e9e', weight: 'bold' }]
                }
              ]
            },
            footer: {
              type: 'box', layout: 'vertical', spacing: 'sm',
              contents: [
                { type:'button', style:'primary', height:'sm',
                  action:{ type:'message', label:'ยืนยันมอบหมาย', text:`ยืนยันมอบหมาย ${tmpId}` } },
                { type:'button', style:'secondary', height:'sm',
                  action:{ type:'message', label:'ยกเลิก', text:`ยกเลิกมอบหมาย ${tmpId}` } }
              ]
            }
          };

          await replyFlexMany(ev.replyToken, [preview], []);
          continue;
        }
      }




      // อัปเดตสถานะ
      {
        const st = parseStatus(text);
        if (st) {
          const t = await getTaskById(st.taskId);
          if (!t) { await reply(ev.replyToken, 'ไม่พบบันทึกงานนั้นครับ'); continue; }

          const isOwner = [t.assignee_id, t.assigner_id].includes(userId);
          if (!isOwner) { await reply(ev.replyToken, 'คุณไม่มีสิทธิ์อัปเดตงานนี้'); continue; }

          await callAppsScript('update_task_status', {
            task_id: st.taskId,
            status: st.status,
            updated_date: new Date().toISOString()
          });

          await reply(ev.replyToken, `อัปเดตสถานะงาน ${st.taskId} เป็น ${st.status.toUpperCase()} ✅`);

          // แจ้งอีกฝั่ง (ผู้สั่งหรือผู้รับ แล้วแต่ใครไม่ใช่คนที่กดอัปเดต)
          const other = userId === t.assignee_id ? t.assigner_id
                      : (userId === t.assigner_id ? t.assignee_id : '');

          if (other) {
            // ใช้ username เป็นหลัก → fallback real_name → displayName
            let actor = 'Unknown';
            try {
              const gu = await callAppsScript('get_user', { user_id: userId });
              actor = gu?.user?.username || gu?.user?.real_name || (await getDisplayName(userId)) || 'Unknown';
            } catch (_) {
              actor = (await getDisplayName(userId)) || 'Unknown';
            }

            await pushText(
              other,
              `งาน ${t.task_id} ถูกอัปเดตเป็น "${st.status}" โดย ${actor}\nรายละเอียด: ${t.task_detail || ''}`
            );
          }
          continue;
        }
      }
    }
  } catch (e) {
    console.error('WEBHOOK_ERR', e);
  }
});

// ── Health
app.get('/healthz', (_req,res)=>res.send('ok'));

// ── Secure cron endpoint (ใช้กับ Render Cron Job)
app.post('/api/cron/reset-richmenu', async (req, res) => {
  try {
    const key = (req.query.key || req.body?.key || '').trim();
    if (!CRON_KEY || key !== CRON_KEY) return res.status(403).send('forbidden');

    await setDefaultRichMenu(RICHMENU_ID_PREREG);      // ตั้งเป็น default ทั่วระบบ
    // (ออปชัน) ถ้าอยากทับค่าเฉพาะรายบุคคลซ้ำด้วย ให้เขียน helper linkRichMenuToAllUsers แล้วเรียกที่นี่
    res.send('ok');
  } catch (e) {
    console.error('CRON_RESET_ERR', e);
    res.status(500).send('error');
  }
});






// ── Static (ถ้าคุณมี frontend/dist)
const distDir = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(distDir));
app.get(/^\/(?!api|auth|webhook|healthz).*/, (_req,res)=>{
  res.sendFile(path.join(distDir, 'index.html'));
});

// ── Simple session (ถ้าใช้เว็บ)
const SESS_COOKIE='sess';
function setSession(res, payload){
  const token = jwt.sign(payload, APP_JWT_SECRET||'secret', { expiresIn:'7d' });
  res.setHeader('Set-Cookie', cookie.serialize(SESS_COOKIE, token, {
    path:'/', httpOnly:true, sameSite:'none', secure:true
  }));
}
function readSession(req){
  const c = cookie.parse(req.headers.cookie || ''); const t = c[SESS_COOKIE];
  if (!t) return null; try { return jwt.verify(t, APP_JWT_SECRET||'secret'); } catch { return null; }
}
function requireAuth(req,res,next){ const s = readSession(req); if(!s) return res.status(401).send('Unauthorized'); req.sess=s; next(); }
function requireRole(roles){ return async (req,res,next)=>{ try{
  const r = await callAppsScript('get_user', { user_id:req.sess.uid });
  const my = (r.user&&String(r.user.role||'').toLowerCase()) || 'user';
  if (!roles.includes(my)) return res.status(403).send('Forbidden'); next();
} catch(e){ console.error('ROLE_ERR',e); res.status(500).send('Error'); }}};



// === [LINE LOGIN: routes] ================================================
// GET /auth/line  → redirect ไป LINE OAuth
app.get('/auth/line', (req, res) => {
  const state = crypto.randomBytes(8).toString('hex');
  const nonce = crypto.randomBytes(8).toString('hex');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_LOGIN_CHANNEL_ID,
    redirect_uri: LINE_LOGIN_CALLBACK_URL,
    state,
    scope: 'profile openid',
    nonce,
    prompt: 'consent'
  });
  res.redirect('https://access.line.me/oauth2/v2.1/authorize?' + params.toString());
});
app.get('/auth/line/start', (req, res) => res.redirect('/auth/line'));


// GET /auth/line/callback  → รับ code แล้วแลก token (เพิ่ม log)
app.get('/auth/line/callback', async (req, res) => {
  try {
    const code  = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!code) return res.status(400).send('Missing code');
    console.log('[LOGIN] callback: got code, state=%s', state);

    // แลกเป็น access_token
    const tokenRes = await fetchFn('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LINE_LOGIN_CALLBACK_URL,
        client_id: LINE_LOGIN_CHANNEL_ID,
        client_secret: LINE_LOGIN_CHANNEL_SECRET
      })
    });
    if (!tokenRes.ok) {
      const txt = await tokenRes.text().catch(() => '');
      console.error('[LOGIN] TOKEN_ERR', tokenRes.status, String(txt).slice(0, 300));
      return res.status(401).send('Token exchange failed');
    }
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;

    // ขอโปรไฟล์: ใช้ userinfo ก่อน ถ้า error ค่อย fallback ไป /v2/profile
    let uid = '', display = '';
    try {
      const info = await fetchLoginUserInfo(accessToken);
      uid     = info.sub || info.userId || '';
      display = info.name || info.displayName || '';
      console.log('[LOGIN] userinfo OK', { uid, name: display });
    } catch (e1) {
      console.error('[LOGIN] USERINFO_ERR', e1?.status || e1?.message || e1);
      try {
        const prof = await fetchLineProfile(accessToken);
        uid     = prof.userId;
        display = prof.displayName || '';
        console.log('[LOGIN] profile OK', { uid, name: display });
      } catch (e2) {
        console.error('[LOGIN] PROFILE_ERR', e2?.status || e2?.message || e2);
        return res.status(401).send('Get profile failed');
      }
    }

    // เก็บ session แล้วกลับหน้าเว็บ
    setSession(res, { uid, name: display });
    console.log('[LOGIN] success for', uid, display);
    res.redirect('/');
  } catch (e) {
    console.error('LINE_LOGIN_CB_ERR', e);
    res.status(500).send('Login failed');
  }
});

// ดึงโปรไฟล์จาก LINE Login (OIDC) – วางไว้ใกล้ๆ กับ fetchLineProfile ด้านบนก็ได้
async function fetchLoginUserInfo(accessToken) {
  const r = await fetchFn('https://api.line.me/oauth2/v2.1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) throw new Error('GET_USERINFO_FAILED:' + r.status);
  return r.json();
}



// ออกจากระบบ
app.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', cookie.serialize('sess', '', {
    path: '/', httpOnly: true, sameSite: 'none', secure: true, maxAge: 0
  }));
  res.json({ ok: true });
});

// endpoint เล็ก ๆ เช็คว่า login แล้วหรือยัง
app.get('/api/me', (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false });
  res.json({ ok: true, uid: s.uid, name: s.name });
});
// ========================================================================


// ── Admin APIs
app.get('/api/admin/tasks',
  requireAuth,
  requireRole(['admin','supervisor','developer']),
  async (req,res)=>{
    try{
      const assignee_id   = String(req.query.assignee_id || '');
      const assignee_name = String(req.query.assignee_name || '');
      const payload = {};
      if (assignee_id) payload.assignee_id = assignee_id;
      if (!assignee_id && assignee_name) payload.assignee_name = assignee_name;
      const r = await callAppsScript('list_tasks', payload);
      res.json({ ok:true, tasks:r.tasks||[] });
    }catch(e){ console.error('TASKS_ADMIN_ERR',e); res.status(500).json({ok:false}); }
  }
);

// Export CSV
function csvEscape(v){ const s=String(v??''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
app.get('/api/admin/tasks/export',
  requireAuth,
  requireRole(['admin','supervisor','developer']),
  async (req,res)=>{
    try{
      const assignee_id   = String(req.query.assignee_id || '');
      const assignee_name = String(req.query.assignee_name || '');
      const from_date     = String(req.query.from || '');
      const to_date       = String(req.query.to || '');
      const payload = {};
      if (assignee_id) payload.assignee_id = assignee_id;
      if (!assignee_id && assignee_name) payload.assignee_name = assignee_name;
      if (from_date) payload.from_date = from_date;
      if (to_date)   payload.to_date   = to_date;

      const r = await callAppsScript('list_tasks', payload);
      const rows = r.tasks || [];
      const headers = ['task_id','assigner_name','assigner_id','assignee_name','assignee_id','task_detail','status','created_date','updated_date','deadline','note'];
      const csv = [headers.join(',')].concat(
        rows.map(o => headers.map(h => csvEscape(o[h])).join(','))
      ).join('\n');

      res.setHeader('Content-Type','text/csv; charset=UTF-8');
      res.setHeader('Content-Disposition','attachment; filename="tasks_export.csv"');
      res.send(csv);
    }catch(e){ console.error('CSV_EXPORT_ERR',e); res.status(500).json({ok:false}); }
  }
);

// Public CSV link (guarded by shared key)
app.get('/api/admin/tasks/export_link', async (req,res)=>{
  try{
    const key = String(req.query.k||'');
    const appKey = APP_SHARED_KEY || process.env.APP_SCRIPT_SHARED_KEY || '';
    if (!appKey || key !== appKey) return res.status(403).send('Forbidden');

    const assignee_id   = String(req.query.assignee_id || '');
    const assignee_name = String(req.query.assignee_name || '');
    const from_date     = String(req.query.from || '');
    const to_date       = String(req.query.to || '');
    const payload = {};
    if (assignee_id) payload.assignee_id = assignee_id;
    if (!assignee_id && assignee_name) payload.assignee_name = assignee_name;
    if (from_date) payload.from_date = from_date;
    if (to_date)   payload.to_date   = to_date;

    const r = await callAppsScript('list_tasks', payload);
    const rows = r.tasks || [];
    const headers = ['task_id','assigner_name','assigner_id','assignee_name','assignee_id','task_detail','status','created_date','updated_date','deadline','note'];
    const csv = [headers.join(',')].concat(
      rows.map(o => headers.map(h => csvEscape(o[h])).join(','))
    ).join('\n');

    res.setHeader('Content-Type','text/csv; charset=UTF-8');
    res.setHeader('Content-Disposition','attachment; filename="tasks_export.csv"');
    res.send(csv);
  }catch(e){ console.error('CSV_EXPORT_LINK_ERR', e); res.status(500).json({ok:false}); }
});

// ── Secure cron endpoint (ใช้กับ Render Cron Job)
async function handleResetRichmenu(req, res) {
  try {
    const key = (req.query.key || req.body?.key || '').trim();
    if (!CRON_KEY || key !== CRON_KEY) return res.status(403).send('forbidden');

    await setDefaultRichMenu(RICHMENU_ID_PREREG);
    // ถ้ามี helper linkRichMenuToAllUsers(...) ก็เรียกเพิ่มที่นี่
    return res.send('ok');
  } catch (e) {
    console.error('CRON_RESET_ERR', e);
    return res.status(500).send('error');
  }
}
app.all('/api/cron/reset-richmenu', handleResetRichmenu);   // 👈 รับทั้ง GET/POST



// ── Schedulers (08:30 / 17:30)
function userActive(u){ return String(u.status||'Active').toLowerCase()==='active'; }

cron.schedule('30 8 * * 1-5', async ()=>{
  try{
    const users = await callAppsScript('list_users', {});
    for (const u of (users.users||[])) {
      if (!userActive(u)) continue;
      const r = await callAppsScript('list_tasks', { assignee_id:u.user_id });
      const today = new Date(); const y=today.getFullYear(), m=today.getMonth(), d=today.getDate();
      const start = new Date(y,m,d,0,0,0).getTime();
      const end   = new Date(y,m,d,23,59,59).getTime();
      const list = (r.tasks||[]).filter(t=>{
        const st = String(t.status||''); const due = parseDeadline(t.deadline);
        const dueToday = !Number.isNaN(due) && (due >= start && due <= end);
        return st!=='done' && (dueToday || !t.deadline);
      });
      const lines = list.slice(0,25).map(t => `• #${shortId(t.task_id)} ${clip(t.task_detail,70)}${t.deadline?` (กำหนด ${t.deadline})`:''}`);
      await pushText(u.user_id, lines.length ? `สวัสดีตอนเช้า 🌤️\nงานวันนี้/คงค้างของคุณ:\n${lines.join('\n')}` : 'สวัสดีตอนเช้า 🌤️ วันนี้ไม่มีงานคงค้าง 🎉');
    }
  }catch(e){ console.error('CRON_0830_ERR', e); }
},{ timezone: TZ });

cron.schedule('30 17 * * 1-5', async ()=>{
  try{
    const users = await callAppsScript('list_users', {});
    for (const u of (users.users||[])) {
      if (!userActive(u)) continue;
      const r = await callAppsScript('list_tasks', { assignee_id:u.user_id });
      const done = (r.tasks||[]).filter(t => String(t.status||'')==='done').length;
      const pend = (r.tasks||[]).filter(t => String(t.status||'')!=='done').length;
      await pushText(u.user_id, `สรุปวันนี้ ⏱️\nเสร็จแล้ว: ${done}\nคงค้าง: ${pend}`);
    }
  }catch(e){ console.error('CRON_1730_ERR', e); }
},{ timezone: TZ });

// รีเซ็ตเมนูเป็น Prereg ทุกวัน 08:30
cron.schedule('30 8 * * *', async () => {
  try {
    if (!RICHMENU_ID_PREREG) { console.error('NO_PREREG_ID'); return; }
    // 1) ตั้ง default ให้ทั้งระบบ
    await setDefaultRichMenu(RICHMENU_ID_PREREG);
    // 2) ลิงก์เมนู Prereg แบบรายผู้ใช้ทับอีกที
    await linkRichMenuToAllUsers(RICHMENU_ID_PREREG);
    console.log('Reset rich menu to PREREG completed @08:30');
  } catch (e) {
    console.error('CRON_RESET_PREREG_ERR', e);
  }
}, { timezone: TZ });

// ── Daily summary for Admin/Supervisor (17:35)
cron.schedule('35 17 * * 1-5', async ()=>{
  try{
    const users = await callAppsScript('list_users', {});
    const allUsers = (users.users||[]).filter(u => String(u.status||'Active').toLowerCase()==='active');

    const now = new Date();
    const y=now.getFullYear(), m=now.getMonth(), d=now.getDate();
    const start = new Date(y,m,d,0,0,0).getTime();
    const end   = new Date(y,m,d,23,59,59).getTime();

    // รวบรวมต่อคน
    const perUser = [];
    for (const u of allUsers) {
      const r = await callAppsScript('list_tasks', { assignee_id: u.user_id });
      const tasks = r.tasks||[];

      const newToday  = tasks.filter(t => {
        const ts = Date.parse(t.created_date||''); return !Number.isNaN(ts) && ts>=start && ts<=end;
      }).length;

      const doneToday = tasks.filter(t => {
        const isDone = String(t.status||'').toLowerCase()==='done';
        const ts = Date.parse(t.updated_date||''); 
        return isDone && !Number.isNaN(ts) && ts>=start && ts<=end;
      }).length;

      const overdue = tasks.filter(t => {
        const due = parseDeadline(t.deadline);
        const st  = String(t.status||'').toLowerCase();
        return !Number.isNaN(due) && due < Date.now() && st!=='done';
      }).length;

      perUser.push({ name: u.real_name || u.username || '-', role: String(u.role||'User'), newToday, doneToday, overdue });
    }

    // ข้อความสรุป
    const lines = ['สรุปวันนี้สำหรับหัวหน้า/แอดมิน', '— งานใหม่วันนี้ | เสร็จวันนี้ | เลยเดดไลน์ —'];
    perUser
      .sort((a,b)=> (b.overdue-a.overdue)|| (b.newToday-a.newToday)|| (b.doneToday-a.doneToday))
      .slice(0,50)
      .forEach(x => lines.push(`• ${x.name} (${x.role}): ${x.newToday} | ${x.doneToday} | ${x.overdue}`));

    const text = lines.join('\n');

    // รายชื่อผู้รับ (admin/supervisor)
    const admins = allUsers.filter(u => ['admin','supervisor'].includes(String(u.role||'').toLowerCase()) && u.user_id);

    // ลิงก์ CSV
    const csvUrl = `${PUBLIC_APP_URL}/api/admin/tasks/export_link?k=${encodeURIComponent(APP_SHARED_KEY||'')}`;
    const quick = [
      { type:'action', action:{ type:'uri', label:'ส่งไฟล์ CSV', uri: csvUrl } }
    ];

    for (const a of admins) {
      await pushTextQuick(a.user_id, text, quick);
    }
  }catch(e){ console.error('CRON_1735_SUMMARY_ERR', e); }
},{ timezone: TZ });



// ── Set default rich menu on boot (optional)
if (RICHMENU_DEFAULT_ID) {
  setDefaultRichMenu(RICHMENU_DEFAULT_ID).catch(e=>console.error('SET_DEFAULT_RM_ERR', e));
}

// ── Start
app.listen(PORT, ()=> {
  console.log(`Server running on :${PORT} (TZ=${TZ})`);
});
