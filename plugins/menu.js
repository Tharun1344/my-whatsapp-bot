'use strict';
const { cmd, commands } = require('../command');
const config = require('../config');
const { getOwnerLinks, ownerLinkLines } = require('../lib/ownerLinks');
// See plugins/alive.js for why link buttons aren't used: not reliably
// supported on the installed Baileys 6.x, caused silent send failures.
const CATEGORY = {
  main: '🌟 MAIN', download: '🎬 DOWNLOADS', group: '👥 GROUP TOOLS', media: '🖼️ MEDIA TOOLS',
  owner: '👑 OWNER CONTROLS', ai: '🤖 AI TOOLS', misc: '🧰 OTHER TOOLS'
};
cmd({ pattern: 'menu', alias: ['help', 'commands'], desc: 'Show available commands', category: 'main' }, async (_sock, _mek, _m, { reply, prefix = '.' }) => {
  const groups = new Map();
  for (const item of commands) {
    if (item.dontAddCommandList || item.hidden) continue;
    const key = String(item.category || 'misc').toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    const aliases = item.alias?.length ? ` _(${item.alias.map(a => `${prefix}${a}`).join(', ')})_` : '';
    groups.get(key).push(`│  ▫️ *${prefix}${item.pattern}*${aliases}${item.desc ? `\n│     ↳ ${item.desc}` : ''}`);
  }
  let out = [
    '╭━━━━━━━━━━━━━━━━━━━━━━╮',
    '┃  ✨ *Dobby-Md MENU* ✨',
    '┃  🇱🇰 Sinhala • Singlish • English',
    '╰━━━━━━━━━━━━━━━━━━━━━━╯',
    `📌 *Prefix:* ${prefix}`,
    '💬 Command එකක් තෝරලා අවශ්‍ය විදිහට භාවිත කරන්න.',
  ];
  for (const [key, items] of [...groups.entries()].sort(([a],[b]) => a.localeCompare(b))) {
    out.push('', `╭─〔 ${CATEGORY[key] || `🧩 ${key.toUpperCase()}`} 〕`, ...items, '╰──────────────────');
  }
  const links = getOwnerLinks();
  out.push('', '🛡️ Group admin commands සඳහා bot එකටත් admin privileges අවශ්‍ය වෙන්න පුළුවන්.');
  if (links.length) out.push('', '📲 *Developer & Links*', ...ownerLinkLines(links));
  out.push('', `📌 Made by ${config.OWNER_NAME}`);
  await reply(out.join('\n'));
});
