'use strict';
const { cmd } = require('../command');
cmd({ pattern: 'mode', desc: 'Set bot mode: public/private', category: 'owner', fromMe: true }, async (_s, _m, _msg, c) => {
  if (!c.isOwner) return c.reply('⛔ Owner only.');
  const mode = String(c.args[0] || '').toLowerCase();
  if (!['public', 'private'].includes(mode)) return c.reply(`Current mode: *${c.settings.mode}*\nUsage: .mode public OR .mode private`);
  c.settings.mode = mode;
  require('../lib/settings').save(c.settings);
  await c.reply(`✅ Bot mode changed to *${mode}*.`);
});
cmd({ pattern: 'welcome', desc: 'Toggle group welcome/goodbye: on/off', category: 'owner', fromMe: true }, async (_s, _m, _msg, c) => {
  if (!c.isOwner) return c.reply('⛔ Owner only.');
  const value = String(c.args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(value)) return c.reply(`Welcome is currently ${c.settings.welcome ? 'ON' : 'OFF'}.\nUsage: .welcome on/off`);
  c.settings.welcome = value === 'on';
  require('../lib/settings').save(c.settings);
  await c.reply(`✅ Welcome/goodbye messages ${value.toUpperCase()}.`);
});
cmd({ pattern: 'accounts', desc: 'List configured account IDs (no secrets)', category: 'owner', fromMe: true }, async (_s, _m, _msg, c) => {
  if (!c.isOwner) return c.reply('⛔ Owner only.');
  await c.reply(`🧩 Current account: ${c.accountId}\nConfigure additional accounts using BOT_ACCOUNTS in Railway Variables. See README.md.`);
});

cmd({ pattern: 'antidelete', desc: 'Toggle anti-delete notices: on/off', category: 'owner', fromMe: true }, async (_s,_m,_msg,c) => {
  if (!c.isOwner) return c.reply('⛔ Owner only.');
  const value = String(c.args[0] || '').toLowerCase();
  if (!['on','off'].includes(value)) return c.reply(`🛡️ Anti-delete: ${c.settings.antiDelete ? 'ON' : 'OFF'}\nUsage: .antidelete on/off`);
  c.settings.antiDelete = value === 'on';
  require('../lib/settings').save(c.settings);
  await c.reply(`🛡️ Anti-delete notices ${value.toUpperCase()}. This only reports messages observed while the bot was online; media recovery is not guaranteed.`);
});
cmd({ pattern: 'goodbye', desc: 'Toggle group goodbye messages: on/off', category: 'owner', fromMe: true }, async (_s,_m,_msg,c) => {
  if (!c.isOwner) return c.reply('⛔ Owner only.');
  const value = String(c.args[0] || '').toLowerCase();
  if (!['on','off'].includes(value)) return c.reply(`👋 Goodbye messages: ${c.settings.goodbye ? 'ON' : 'OFF'}\nUsage: .goodbye on/off`);
  c.settings.goodbye = value === 'on';
  require('../lib/settings').save(c.settings);
  await c.reply(`👋 Goodbye messages ${value.toUpperCase()}.`);
});

cmd({ pattern: 'dmgreet', desc: 'Toggle the one-time greeting sent to new private chats: on/off', category: 'owner', fromMe: true }, async (_s,_m,_msg,c) => {
  if (!c.isOwner) return c.reply('⛔ Owner only.');
  const value = String(c.args[0] || '').toLowerCase();
  if (!['on','off'].includes(value)) return c.reply(`👋 DM greeting: ${c.settings.dmGreeting ? 'ON' : 'OFF'}\nUsage: .dmgreet on/off\nCustomize the text with the GREETING_MSG environment variable.`);
  c.settings.dmGreeting = value === 'on';
  require('../lib/settings').save(c.settings);
  await c.reply(`👋 New-chat greeting ${value.toUpperCase()}.`);
});

cmd({ pattern: 'autoreact', desc: 'Owner-only automatic reactions: on/off/set emoji', category: 'owner', fromMe: true }, async (_s,_m,_msg,c) => {
  if (!c.isOwner) return c.reply('⛔ මේ setting එක owner ට විතරයි.');
  const action = String(c.args[0] || '').toLowerCase();
  if (action === 'on' || action === 'off') {
    c.settings.autoReact = action === 'on';
    require('../lib/settings').save(c.settings);
    return c.reply(`${action === 'on' ? '💖' : '🛑'} Auto-react ${action.toUpperCase()}.`);
  }
  if (action === 'set') {
    const emoji = c.args.slice(1).join(' ').trim();
    if (!emoji || emoji.length > 16) return c.reply(`🎭 Usage: ${c.prefix}autoreact set ❤️`);
    c.settings.autoReactEmoji = emoji;
    require('../lib/settings').save(c.settings);
    return c.reply(`✅ Auto-react emoji set to ${emoji}`);
  }
  return c.reply(`💖 *Auto-react settings*\nStatus: ${c.settings.autoReact ? 'ON' : 'OFF'}\nEmoji: ${c.settings.autoReactEmoji || '❤️'}\nℹ️ Only reacts to recognized bot commands, never to ordinary chat messages.\n\n${c.prefix}autoreact on\n${c.prefix}autoreact off\n${c.prefix}autoreact set ❤️`);
});
