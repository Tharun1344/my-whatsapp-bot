'use strict';
const { cmd } = require('../command');
function requireGroup(ctx) { if (!ctx.isGroup) { ctx.reply('⚠️ This command only works in groups.'); return false; } return true; }
function requireAdmin(ctx) { if (!requireGroup(ctx)) return false; if (!ctx.isAdmins && !ctx.isOwner) { ctx.reply('⛔ Group admins only.'); return false; } if (!ctx.isBotAdmins) { ctx.reply('⚠️ Make the bot an admin first.'); return false; } return true; }
cmd({ pattern: 'groupinfo', alias: ['ginfo'], desc: 'Show group details', category: 'group' }, async (_s, _m, _msg, c) => {
  if (!requireGroup(c)) return;
  const admins = c.groupAdmins.map(j => `@${j.split('@')[0]}`).join(' ');
  await c.reply(`👥 *${c.groupName}*\n🆔 ${c.from}\n👤 Members: ${c.participants.length}\n🛡️ Admins: ${admins || 'Not available'}`, { mentions: c.groupAdmins });
});
cmd({ pattern: 'tagall', alias: ['everyone'], desc: 'Mention all group members', category: 'group' }, async (_s, _m, _msg, c) => {
  if (!requireAdmin(c)) return;
  const mentions = c.participants.map(p => p.id);
  const lines = mentions.map(j => `• @${j.split('@')[0]}`).join('\n');
  await c.reply(`📢 *Attention everyone*\n${c.q ? `${c.q}\n` : ''}\n${lines}`, { mentions });
});
cmd({ pattern: 'kick', alias: ['remove'], desc: 'Remove a mentioned/replied/numbered member', category: 'group' }, async (s, _m, msg, c) => {
  if (!requireAdmin(c)) return;
  const target = c.getTargetJid(); if (!target) return c.reply('Reply to a member, mention them, or provide a phone number.');
  if ((c.botIds || [c.botNumber2]).includes(target) || target === c.sender || target.split('@')[0] === c.senderNumber) return c.reply('⚠️ Cannot remove the bot or yourself with this command.');
  await s.groupParticipantsUpdate(c.from, [target], 'remove'); await c.reply('✅ Remove request sent.');
});
for (const [pattern, action, desc] of [['promote','promote','Promote a member to admin'], ['demote','demote','Demote a group admin']]) {
  cmd({ pattern, desc, category: 'group' }, async (s, _m, _msg, c) => {
    if (!requireAdmin(c)) return;
    const target = c.getTargetJid(); if (!target) return c.reply('Reply to a member, mention them, or provide a phone number.');
    await s.groupParticipantsUpdate(c.from, [target], action); await c.reply(`✅ ${action} request sent.`);
  });
}
cmd({ pattern: 'grouplink', alias: ['link'], desc: 'Get group invite link', category: 'group' }, async (s, _m, _msg, c) => {
  if (!requireGroup(c)) return;
  if (!c.isBotAdmins && !c.isOwner) return c.reply('⚠️ Bot admin permission is required.');
  const code = await s.groupInviteCode(c.from); await c.reply(`🔗 https://chat.whatsapp.com/${code}`);
});
cmd({ pattern: 'revoke', desc: 'Reset group invite link', category: 'group' }, async (s, _m, _msg, c) => {
  if (!requireAdmin(c)) return;
  await s.groupRevokeInvite(c.from); await c.reply('✅ Group invite link has been reset.');
});

cmd({ pattern: 'mute', desc: 'Mute bot responses in this group: .mute on/off', category: 'group' }, async (_s,_m,_msg,c) => {
  if (!c.isGroup) return c.reply('⚠️ මේ command එක group එකක පමණයි.');
  if (!c.isAdmins && !c.isOwner) return c.reply('⛔ Group admins only.');
  const value = String(c.args[0] || '').toLowerCase();
  if (!['on','off'].includes(value)) return c.reply(`🔇 Bot mute: ${c.settings.mutedGroups.includes(c.from) ? 'ON' : 'OFF'}\nභාවිතය: .mute on/off`);
  if (value === 'on' && !c.settings.mutedGroups.includes(c.from)) c.settings.mutedGroups.push(c.from);
  if (value === 'off') c.settings.mutedGroups = c.settings.mutedGroups.filter(j => j !== c.from);
  require('../lib/settings').save(c.settings);
  await c.reply(value === 'on' ? '🔇 Bot replies muted in this group. Admin/owner can still control it.' : '🔊 Bot replies enabled in this group.');
});
