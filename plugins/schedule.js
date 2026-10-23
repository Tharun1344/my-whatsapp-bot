'use strict';
const { cmd } = require('../command');
const sch = require('../lib/scheduler');

const HELP = [
  '⏰ *Message schedule කරන විදිහ*',
  '',
  '*.schedule <වෙලාව> | <message>*  → මේ chat එකටම',
  '*.schedule <වෙලාව> | <number> | <message>*  → වෙන කෙනෙකුට (උදා: 94771234567)',
  '',
  '*වෙලාව* විදිහට:',
  '• 10m  /  2h  /  1h30m  /  1d',
  '• 18:30  /  6:30pm  (ඊළඟ වතාවට එන වෙලාව)',
  '• tomorrow 07:00',
  '• 2026-10-25 18:30',
  '',
  `🕒 වෙලාව Sri Lanka time (UTC${sch.TZ_OFFSET_MIN >= 0 ? '+' : '-'}${Math.floor(Math.abs(sch.TZ_OFFSET_MIN) / 60)}:${String(Math.abs(sch.TZ_OFFSET_MIN) % 60).padStart(2, '0')})`,
  '',
  '📋 *.schedules* — pending ඒවා බලන්න',
  '❌ *.unschedule <id>* — cancel කරන්න',
].join('\n');

cmd({ pattern: 'schedule', alias: ['sch'], desc: 'Schedule a message: .schedule 18:30 | Hello', category: 'owner', fromMe: true }, async (_s, _m, _msg, c) => {
  if (!c.isOwner) return c.reply('⛔ Owner only.');
  // Use the raw body so line breaks in the message are preserved.
  const raw = String(c.body || '').replace(/^\S+\s*/, '');
  const parts = raw.split('|').map(x => x.trim());
  if (parts.length < 2 || !parts[0]) return c.reply(HELP);
  const at = sch.parseWhen(parts[0]);
  if (!at) return c.reply(`❓ වෙලාව තේරුණේ නැහැ: "${parts[0]}"\n\n${HELP}`);
  let jid = c.from, text;
  if (parts.length >= 3 && /^\+?\d{7,15}$/.test(parts[1].replace(/[\s-]/g, ''))) {
    jid = `${parts[1].replace(/\D/g, '')}@s.whatsapp.net`;
    text = parts.slice(2).join(' | ');
  } else text = parts.slice(1).join(' | ');
  if (!text) return c.reply('✏️ යවන්න ඕන message එක හිස්!\n\n' + HELP);
  try {
    const item = sch.add({ accountId: c.accountId, jid, text, at });
    const target = jid === c.from ? 'මේ chat එකට' : `${jid.split('@')[0]} ට`;
    await c.reply(`✅ Schedule කළා!\n🆔 ${item.id}\n🕒 ${sch.formatLocal(at)}\n📨 ${target}\n💬 ${text.slice(0, 200)}`);
  } catch (e) { await c.reply(`❌ ${e.message}`); }
});

cmd({ pattern: 'schedules', alias: ['schlist'], desc: 'List pending scheduled messages', category: 'owner', fromMe: true }, async (_s, _m, _msg, c) => {
  if (!c.isOwner) return c.reply('⛔ Owner only.');
  const items = sch.list(c.accountId);
  if (!items.length) return c.reply('📭 Schedule කරපු messages නැහැ.');
  await c.reply('📋 *Scheduled messages*\n\n' + items.map(i => `🆔 ${i.id} • ${sch.formatLocal(i.at)}\n   → ${i.jid.split('@')[0]}${i.jid.endsWith('@g.us') ? ' (group)' : ''}: ${i.text.slice(0, 60).replace(/\n/g, ' ')}`).join('\n\n'));
});

cmd({ pattern: 'unschedule', alias: ['schcancel'], desc: 'Cancel a scheduled message: .unschedule <id>', category: 'owner', fromMe: true }, async (_s, _m, _msg, c) => {
  if (!c.isOwner) return c.reply('⛔ Owner only.');
  const id = c.args[0];
  if (!id) return c.reply('භාවිතය: .unschedule <id>  (.schedules වලින් id බලන්න)');
  await c.reply(sch.remove(c.accountId, id) ? `🗑️ ${id} cancel කළා.` : `❓ ${id} කියලා schedule එකක් නැහැ.`);
});
