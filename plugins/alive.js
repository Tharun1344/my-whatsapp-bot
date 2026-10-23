'use strict';
const { cmd } = require('../command');
const config = require('../config');
const { runtime } = require('../lib/functions');
const { getOwnerLinks, ownerLinkLines } = require('../lib/ownerLinks');
// NOTE: link buttons (lib/buttons.js) are NOT used here. The installed Baileys
// version (6.7.x) doesn't officially support WhatsApp native-flow "cta_url"
// buttons (that lands in 7.0+); sending them gets silently dropped by
// WhatsApp with no JS error, which made .alive appear to do nothing. Plain
// text links are the reliable option until the Baileys dependency is
// upgraded past 7.0.

cmd({ pattern: 'alive', desc: 'Show bot status and owner contact card', category: 'main' }, async (sock, mek, _m, c) => {
  const links = getOwnerLinks();
  const card = [
    '╭━━━〔 ✨ *Dobby-md* ✨ 〕━━━╮',
    `┃ 👋 ${config.ALIVE_MSG}`,
    '┃',
    '┃ 🟢 *Status:* Online',
    `┃ 🧩 *Account:* ${c.accountId}`,
    `┃ ⏱️ *Uptime:* ${runtime(process.uptime()) || '0 seconds'}`,
    '┃',
    `┃ 👑 *Developer:* ${config.OWNER_NAME}`,
    ...(links.length ? ['┃', '┃ 📲 *Contact & Socials*', ...ownerLinkLines(links).map(x => `┃ ${x}`)] : []),
    '╰━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `💡 Commands බලන්න *${c.prefix}menu* යවන්න.`,
  ].join('\n');

  if (config.ALIVE_IMG) {
    // Keep the image flow simple/robust: links stay as readable text next to the photo.
    try { await sock.sendMessage(c.from, { image: { url: config.ALIVE_IMG }, caption: card }, { quoted: mek }); return; }
    catch (err) { console.warn('[alive image]', err.message); }
  }

  await c.reply(card);
});

cmd({ pattern: 'ping', desc: 'Check response speed', category: 'main' }, async (_sock, _mek, _m, { reply }) => reply(`🏓 *PONG!*
⚡ Bot is responding
⏱️ Uptime: ${runtime(process.uptime()) || '0 seconds'}`));
