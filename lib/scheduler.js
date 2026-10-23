'use strict';
// Scheduled messages: persisted to data/schedules.json, checked every 15s.
const fs = require('fs');
const path = require('path');
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..');
const FILE = path.join(STORAGE_DIR, 'data', 'schedules.json');
const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN || 330); // Sri Lanka = UTC+5:30
const MAX_PENDING = 100;
const MAX_LATE_MS = 6 * 60 * 60 * 1000; // after downtime, still send things up to 6h late

let items = null;
const socks = new Map();
let timer = null;
let log = console;

function load() {
  if (items) return items;
  try { items = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (!Array.isArray(items)) items = []; } catch { items = []; }
  return items;
}
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
  fs.renameSync(tmp, FILE);
}

// Local "wall clock" in the configured timezone -> UTC ms
function localToUtc(y, mo, d, h, mi) { return Date.UTC(y, mo - 1, d, h, mi) - TZ_OFFSET_MIN * 60000; }
function nowLocalParts(now = Date.now()) {
  const t = new Date(now + TZ_OFFSET_MIN * 60000);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// Accepts: 10m | 2h | 1d | 1h30m | 18:30 | 6:30pm | 2026-10-25 18:30 | tomorrow 07:00
function parseWhen(input, now = Date.now()) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m(?:in)?)?$/);
  if (m && (m[1] || m[2] || m[3])) {
    const ms = ((+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 60000;
    return ms > 0 ? now + ms : null;
  }
  const time = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?\s*$/);
  if (!time) return null;
  let h = +time[1]; const mi = +time[2];
  if (time[3] === 'pm' && h < 12) h += 12;
  if (time[3] === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  const rest = s.slice(0, time.index).trim();
  const today = nowLocalParts(now);
  if (!rest || rest === 'today' || rest === 'tomorrow') {
    let ts = localToUtc(today.y, today.mo, today.d, h, mi);
    if (rest === 'tomorrow') ts += 86400000;
    else if (ts <= now && !rest) ts += 86400000; // bare time already passed -> tomorrow
    return ts > now ? ts : null;
  }
  const dm = rest.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!dm) return null;
  const ts = localToUtc(+dm[1], +dm[2], +dm[3], h, mi);
  return ts > now ? ts : null;
}

function formatLocal(ts) {
  const t = new Date(ts + TZ_OFFSET_MIN * 60000);
  const p = n => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

function add({ accountId, jid, text, at }) {
  load();
  if (items.filter(i => i.accountId === accountId).length >= MAX_PENDING) throw new Error('Too many scheduled messages (max 100).');
  const id = Math.random().toString(36).slice(2, 6);
  const item = { id, accountId, jid, text: String(text).slice(0, 4000), at };
  items.push(item); save();
  return item;
}
function list(accountId) { return load().filter(i => i.accountId === accountId).sort((a, b) => a.at - b.at); }
function remove(accountId, id) {
  load();
  const before = items.length;
  items = items.filter(i => !(i.accountId === accountId && i.id === id));
  if (items.length !== before) { save(); return true; }
  return false;
}

async function tick() {
  load();
  const now = Date.now();
  const due = items.filter(i => i.at <= now && socks.has(i.accountId));
  for (const item of due) {
    const late = now - item.at > MAX_LATE_MS;
    try {
      if (!late) await socks.get(item.accountId).sendMessage(item.jid, { text: item.text });
      else log.warn?.({ id: item.id }, 'Scheduled message dropped: more than 6h late');
    } catch (err) {
      log.warn?.({ err: err.message, id: item.id }, 'Scheduled send failed');
      if ((item.tries = (item.tries || 0) + 1) < 3) { item.at = now + 60000; save(); continue; }
    }
    items = items.filter(i => i !== item); save();
  }
}

function start(accountId, sock, logger) {
  socks.set(accountId, sock);
  if (logger) log = logger;
  if (!timer) { timer = setInterval(() => tick().catch(() => {}), 15000); timer.unref?.(); }
}

module.exports = { parseWhen, formatLocal, add, list, remove, start, tick, TZ_OFFSET_MIN };
