'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { pipeline } = require('stream/promises');
const express = require('express');
const P = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  fetchLatestBaileysVersion,
  Browsers,
  downloadContentFromMessage,
  WAMessageStubType,
} = require('@whiskeysockets/baileys');
const { File } = require('megajs');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { sms } = require('./lib/msg');
const { getGroupAdmins, runtime } = require('./lib/functions');
const { commands, replyHandlers } = require('./command');

const ROOT = __dirname;
const STORAGE_DIR = process.env.STORAGE_DIR || ROOT;
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const SESSIONS_DIR = path.join(STORAGE_DIR, 'sessions');
const LEGACY_SESSION_DIR = path.join(STORAGE_DIR, 'auth_info_baileys');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PORT = Number(process.env.PORT || 8000);
const PREFIX = process.env.PREFIX || '.';
const logger = P({ level: process.env.LOG_LEVEL || 'info' });
const sockets = new Map();
const reconnectTimers = new Map();
const reconnectAttempts = new Map();
let settings = { mode: process.env.BOT_MODE === 'private' ? 'private' : 'public', welcome: true, goodbye: true, antiDelete: true, autoReact: false, autoReactEmoji: '❤️', mutedGroups: [], dmGreeting: true, greetedUsers: [] };
const recentMessages = new Map();
const MAX_CACHED_MESSAGES = 1500;
// Anti-delete / anti-edit support (session-only; resets on restart, same as recentMessages).
const contactNames = new Map(); // jid -> saved/pushed contact name, learned from WhatsApp contact sync
const senderDeleteCounts = new Map(); // jid -> number of deleted messages observed this session
const senderEditCounts = new Map(); // jid -> number of edited messages observed this session
function extractPreviewText(messageContent) {
  if (!messageContent) return '';
  if (typeof messageContent.conversation === 'string') return messageContent.conversation;
  const mt = getContentType(messageContent);
  const wrapped = messageContent[mt];
  return messageContent.extendedTextMessage?.text || wrapped?.caption || '';
}
function displayNameFor(jid, fallbackPushName) {
  return contactNames.get(jid) || (fallbackPushName && fallbackPushName.trim()) || jid.split('@')[0];
}
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try { supabase = require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); }
  catch (e) { logger.warn({ err: e }, 'Supabase client unavailable'); }
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (fs.existsSync(SETTINGS_FILE)) {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; }
  catch (e) { logger.warn({ err: e }, 'Invalid settings.json; defaults will be used'); }
}
function saveSettings() {
  const tmp = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.renameSync(tmp, SETTINGS_FILE);
}
function safeId(value) {
  const id = String(value || 'default');
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) throw new Error(`Invalid account id: ${id}`);
  return id;
}
function readAccounts() {
  if (process.env.BOT_ACCOUNTS) {
    let parsed;
    try { parsed = JSON.parse(process.env.BOT_ACCOUNTS); }
    catch { throw new Error('BOT_ACCOUNTS must be valid JSON (array of account objects).'); }
    if (!Array.isArray(parsed) || !parsed.length) throw new Error('BOT_ACCOUNTS must be a non-empty JSON array.');
    const ids = new Set();
    return parsed.map((item, index) => {
      const id = safeId(item.id || `account${index + 1}`);
      if (ids.has(id)) throw new Error(`Duplicate account id: ${id}`);
      ids.add(id);
      return { id, ownerNumber: String(item.ownerNumber || process.env.BOT_OWNER || config.BOT_OWNER || '').replace(/\D/g, ''), sessionId: item.sessionId || '', sessionPath: path.join(SESSIONS_DIR, id) };
    });
  }
  // Backward compatibility: use the original session directory and SESSION_ID.
  return [{ id: 'default', ownerNumber: String(process.env.BOT_OWNER || config.BOT_OWNER || '').replace(/\D/g, ''), sessionId: config.SESSION_ID || '', sessionPath: LEGACY_SESSION_DIR, legacy: true }];
}
async function restoreMegaSession(sessionId, sessionPath) {
  const creds = path.join(sessionPath, 'creds.json');
  if (fs.existsSync(creds)) return;
  if (!sessionId) { logger.info({ sessionPath }, 'No imported session configured; waiting for QR pairing'); return; }
  fs.mkdirSync(sessionPath, { recursive: true });
  logger.info('Restoring session archive from MEGA');
  const url = sessionId.startsWith('http') ? sessionId : `https://mega.nz/file/${sessionId}`;
  const file = File.fromURL(url);
  const data = await new Promise((resolve, reject) => file.download((err, buffer) => err ? reject(err) : resolve(buffer)));
  // SESSION_ID must point to a Baileys creds.json file, not a full multi-file auth directory archive.
  fs.writeFileSync(creds, data);
}
function unwrapMessage(message) {
  let current = message;
  while (current) {
    const type = getContentType(current);
    if (type === 'ephemeralMessage') current = current.ephemeralMessage?.message;
    // Deliberately do not unwrap view-once payloads: respect the sender's one-time media setting.
    else break;
  }
  return current || message;
}
function loadPlugins() {
  const pluginDir = path.join(ROOT, 'plugins');
  for (const file of fs.readdirSync(pluginDir).filter(f => f.endsWith('.js')).sort()) {
    require(path.join(pluginDir, file));
    logger.info(`Loaded plugin: ${file}`);
  }
}
function normalizeJid(jid) { return jidNormalizedUser(String(jid || '')); }
function getTargetJid(m, q, sender) {
  const mentioned = m.mentionUser?.find(j => j && j !== sender);
  if (mentioned) return normalizeJid(mentioned);
  if (m.quoted?.sender) return normalizeJid(m.quoted.sender);
  const number = String(q || '').replace(/\D/g, '');
  return number.length >= 7 ? `${number}@s.whatsapp.net` : null;
}

loadPlugins();

async function handleMessage(sock, account, incoming) {
  if (!incoming?.message || incoming.key?.remoteJid === 'status@broadcast') return;
  const rawMessage = incoming.message;
  let probe = rawMessage;
  while (probe && getContentType(probe) === 'ephemeralMessage') probe = probe.ephemeralMessage?.message;
  const rawType = getContentType(probe || rawMessage);
  const isViewOnce = ['viewOnceMessage','viewOnceMessageV2','viewOnceMessageV2Extension'].includes(rawType);
  incoming.message = unwrapMessage(rawMessage);
  if (isViewOnce) {
    const senderJid = normalizeJid(incoming.key.participant || incoming.key.remoteJid);
    const accountOwner = account.ownerNumber ? `${account.ownerNumber}@s.whatsapp.net` : '';
    if (accountOwner) await sock.sendMessage(accountOwner, { text: `🔒 View-once media received in ${incoming.key.remoteJid}. DANUWA-MD does not save or bypass view-once media protections.` }).catch(() => {});
    return;
  }
  const m = sms(sock, incoming);
  const from = incoming.key.remoteJid;
  const body = String(m.body || '').trim();
  const isCmd = body.startsWith(PREFIX);
  const pieces = isCmd ? body.slice(PREFIX.length).trim().split(/\s+/) : [];
  const commandName = (pieces.shift() || '').toLowerCase();
  const args = pieces;
  const q = args.join(' ');
  const sender = normalizeJid(m.sender || incoming.key.participant || from);
  const senderNumber = sender.split('@')[0].split(':')[0];
  const isGroup = from.endsWith('@g.us');
  if (isGroup && settings.mutedGroups.includes(from) && commandName !== 'mute' && !incoming.key.fromMe && !(account.ownerNumber && account.ownerNumber === String(sender).split('@')[0].split(':')[0])) return;
  const botNumber = String(sock.user?.id || '').split(':')[0].split('@')[0];
  const isMe = Boolean(incoming.key.fromMe) || senderNumber === botNumber;
  const isOwner = isMe || (account.ownerNumber && account.ownerNumber === senderNumber);
  const groupMetadata = isGroup ? await sock.groupMetadata(from).catch(() => null) : null;
  const participants = groupMetadata?.participants || [];
  const groupAdmins = isGroup ? getGroupAdmins(participants).map(normalizeJid) : [];
  const botJid = normalizeJid(sock.user?.id || '');
  // New WhatsApp groups use LID addressing, so admin ids are '...@lid' while sock.user.id is a phone JID.
  // Compare against BOTH of the bot's identities, otherwise ".kick" always says "make the bot an admin first".
  const botLid = normalizeJid(sock.user?.lid || '');
  const botIds = [botJid, botLid].filter(Boolean);
  const isBotAdmins = isGroup && botIds.some(j => groupAdmins.includes(j));
  const isAdmins = isGroup && groupAdmins.includes(sender);
  const reply = (text, options = {}) => sock.sendMessage(from, { text: String(text), ...options }, { quoted: incoming }).catch(err => { console.error(`[SEND FAILED] to ${from} ->`, err?.message || err); throw err; });

  if (settings.mode === 'private') {
    // Private means owner self-chat only; do not accept other private chats or groups.
    const ownerJid = account.ownerNumber ? `${account.ownerNumber}@s.whatsapp.net` : '';
    if (!ownerJid || from !== ownerJid || !(incoming.key.fromMe || senderNumber === account.ownerNumber)) return;
  }

  // One-time greeting for a brand-new private chat. Fires before the
  // command handling below so it doesn't interfere with a first message
  // that is itself a command.
  if (!isGroup && !incoming.key.fromMe && settings.dmGreeting && !settings.greetedUsers.includes(sender)) {
    settings.greetedUsers.push(sender);
    if (settings.greetedUsers.length > 5000) settings.greetedUsers.splice(0, settings.greetedUsers.length - 5000);
    saveSettings();
    const greeting = (config.GREETING_MSG && config.GREETING_MSG.trim()) || [
      `ආයුබෝවන්${incoming.pushName ? `, ${incoming.pushName}` : ''}! 👋`,
      `මේ *${config.BOT_NAME}* — ${config.OWNER_NAME} ගේ WhatsApp bot එක.`,
      `මොනවද කරන්න පුළුවන්ද බලන්න *${PREFIX}menu*, bot/developer ගැන බලන්න *${PREFIX}alive* කියලා යවන්න.`,
    ].join('\n');
    await sock.sendMessage(from, { text: greeting }).catch(err => logger.debug({ err: err.message }, 'DM greeting failed'));
  }

  const context = {
    from, quoted: incoming, body, isCmd, command: commandName, args, q, isGroup, sender, prefix: PREFIX,
    senderNumber, botNumber, botNumber2: botJid, botIds, pushname: incoming.pushName || 'WhatsApp User',
    isMe, isOwner, groupMetadata, groupName: groupMetadata?.subject || '', participants,
    groupAdmins, isBotAdmins, isAdmins, reply, accountId: account.id, settings,
    getTargetJid: () => getTargetJid(m, q, sender),
  };
  if (isCmd && commandName) {
    const plugin = commands.find(c => String(c.pattern || '').toLowerCase() === commandName || (c.alias || []).map(a => String(a).toLowerCase()).includes(commandName));
    if (plugin) {
      if (plugin.fromMe && !isOwner) return reply('⛔ Owner only command.');
      // React only to recognized bot commands, never to ordinary chat messages.
      const reactEmoji = plugin.react || (settings.autoReact ? settings.autoReactEmoji : '');
      if (reactEmoji) await sock.sendMessage(from, { react: { text: String(reactEmoji).slice(0, 16), key: incoming.key } }).catch(() => {});
      try { await plugin.function(sock, incoming, m, context); }
      catch (err) { console.error(`[COMMAND FAILED] .${commandName} ->`, err?.stack || err); logger.error({ err, commandName, accountId: account.id }, 'Command failed'); await reply('❌ Command failed. Check the bot logs.').catch(() => {}); }
    } else {
      await reply(`❓ Unknown command: ${PREFIX}${commandName}\nUse ${PREFIX}menu to see available commands.`).catch(() => {});
    }
  }
  for (const handler of replyHandlers) {
    try {
      if (handler.filter(body, { sender, message: incoming })) {
        await handler.function(sock, incoming, m, { ...context, body });
        break;
      }
    } catch (err) { logger.error({ err, accountId: account.id }, 'Reply handler failed'); }
  }
}

async function connectAccount(account) {
  const id = account.id;
  if (sockets.has(id)) return;
  try {
    fs.mkdirSync(account.sessionPath, { recursive: true });
    await restoreMegaSession(account.sessionId, account.sessionPath);
    const { state, saveCreds } = await useMultiFileAuthState(account.sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      logger: P({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.macOS('Firefox'),
      auth: state,
      version,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });
    let pairingRequested = false;
    sockets.set(id, sock);
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async update => {
      if (update.qr) {
        // Pairing-code login: no giant QR in Railway logs. Set PAIRING_NUMBER (e.g. 94771234567) to use it.
        const pairNumber = String(process.env.PAIRING_NUMBER || account.ownerNumber || '').replace(/\D/g, '');
        if (pairNumber && !sock.authState?.creds?.registered) {
          if (!pairingRequested) {
            pairingRequested = true;
            setTimeout(async () => {
              try {
                const raw = await sock.requestPairingCode(pairNumber);
                const code = String(raw).match(/.{1,4}/g)?.join('-') || raw;
                console.log(`\n========== WHATSAPP PAIRING CODE: ${code} ==========\nWhatsApp > Linked devices > Link a device > "Link with phone number instead" > enter this code\n`);
              } catch (err) { pairingRequested = false; logger.warn({ err: err.message, accountId: id }, 'Pairing code request failed'); }
            }, 3000);
          }
        } else {
          logger.info({ accountId: id }, 'Scan this QR with WhatsApp > Linked devices > Link a device (or set PAIRING_NUMBER to use a pairing code instead)');
          qrcode.generate(update.qr, { small: true });
        }
      }
      if (update.connection === 'open') {
        reconnectAttempts.set(id, 0);
        logger.info({ accountId: id, user: sock.user?.id }, 'WhatsApp account connected');
        const selfJid = normalizeJid(sock.user?.id || '');
        if (selfJid) {
          await sock.sendMessage(selfJid, { text: `✅ DANUWA-MD connected\nAccount: ${id}\nPrefix: ${PREFIX}` }).catch(err => logger.warn({ err, accountId: id }, 'Owner notification failed'));
        }
        try { require('./lib/scheduler').start(id, sock, logger); } catch (err) { logger.warn({ err: err.message }, 'Scheduler failed to start'); }
      }
      if (update.connection === 'close') {
        sockets.delete(id);
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          logger.error({ accountId: id }, 'WhatsApp session logged out; re-pair this account before restarting it.');
          return;
        }
        const attempts = (reconnectAttempts.get(id) || 0) + 1;
        reconnectAttempts.set(id, attempts);
        const delay = Math.min(60000, 1500 * (2 ** Math.min(attempts - 1, 5)));
        logger.warn({ accountId: id, statusCode, delay }, 'Connection closed; reconnect scheduled');
        clearTimeout(reconnectTimers.get(id));
        reconnectTimers.set(id, setTimeout(() => connectAccount(account), delay));
      }
    });
    // Learn display names from WhatsApp's own contact sync so anti-delete/edit
    // notices can show a saved name instead of a bare number when possible.
    // (Coverage depends on how much WhatsApp syncs to this linked device.)
    const cacheContacts = list => {
      for (const c of list || []) {
        const jid = normalizeJid(c.id);
        const name = c.name || c.notify || c.verifiedName;
        if (jid && name) contactNames.set(jid, name);
      }
    };
    sock.ev.on('contacts.upsert', cacheContacts);
    sock.ev.on('contacts.update', cacheContacts);
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages) {
        if (message?.key?.id && message.message && !message.key.fromMe) {
          const content = unwrapMessage(message.message);
          const mt = getContentType(content);
          const text = extractPreviewText(content);
          recentMessages.set(message.key.id, {
            key: message.key, chat: message.key.remoteJid, sender: normalizeJid(message.key.participant || message.key.remoteJid),
            pushName: message.pushName || '', text: String(text || '').slice(0, 2000), type: mt, timestamp: Date.now(),
          });
          if (recentMessages.size > MAX_CACHED_MESSAGES) recentMessages.delete(recentMessages.keys().next().value);
        }
        try { await handleMessage(sock, account, message); }
        catch (err) { console.error('[MESSAGE HANDLER FAILED]', err?.stack || err); logger.error({ err, accountId: id }, 'Message handler failed'); }
      }
    });
    sock.ev.on('messages.update', async updates => {
      if (process.env.ANTIDELETE_ENABLED === 'false' || !settings.antiDelete) return;
      // Always report to the linked account's own self-chat (works even if BOT_OWNER is not set).
      const owner = normalizeJid(sock.user?.id || '');
      if (!owner) return;
      for (const item of updates || []) {
        const update = item.update || {};
        // Baileys normalizes a WhatsApp "delete for everyone" (REVOKE) into a
        // messages.update item with update.message === null and
        // update.messageStubType === REVOKE — it is NOT delivered as
        // update.message.protocolMessage. An edit instead arrives with
        // update.message set to the new content. Key placement also varies
        // between event shapes, so every plausible location is checked.
        const msgId = item.key?.id || item.id || update.key?.id;
        if (!msgId) continue;
        const cached = recentMessages.get(msgId);
        if (!cached) continue; // nothing we observed to report
        const isRevoke = update.messageStubType === WAMessageStubType.REVOKE || (update.message === null && update.messageStubType !== undefined);
        const isEdit = !isRevoke && !!update.message;
        if (!isRevoke && !isEdit) continue;
        const name = displayNameFor(cached.sender, cached.pushName);
        let chatLabel = '👤 Private chat';
        if (String(cached.chat).endsWith('@g.us')) {
          const gm = await sock.groupMetadata(cached.chat).catch(() => null);
          chatLabel = `👥 Group: ${gm?.subject || cached.chat}`;
        }
        if (isRevoke) {
          recentMessages.delete(msgId);
          const count = (senderDeleteCounts.get(cached.sender) || 0) + 1;
          senderDeleteCounts.set(cached.sender, count);
          const note = [
            '🛡️ *Anti-delete notice*',
            `📍 ${chatLabel}`,
            `👤 Sender: ${name} (${cached.sender.split('@')[0]}${cached.sender.endsWith('@lid') ? ' • LID' : ''})`,
            `🔁 Deleted messages from this sender (this session): ${count}`,
            `🧾 Type: ${cached.type || 'message'}`,
            `💬 Text: ${cached.text || '[No text / media message]'}`,
            '',
            'ℹ️ Only messages cached while the bot was online can be reported; deleted media is not guaranteed to be recoverable.',
          ].join('\n');
          await sock.sendMessage(owner, { text: note }).catch(err => logger.warn({ err, accountId: id }, 'Anti-delete owner notice failed'));
          if (supabase) {
            try { await supabase.from(process.env.SUPABASE_AUDIT_TABLE || 'bot_audit_events').insert({ account_id: id, event_type: 'message_deleted', chat_jid: cached.chat, sender_jid: cached.sender, message_type: cached.type || 'message', message_text: cached.text || null, created_at: new Date().toISOString() }); }
            catch (err) { logger.warn({ err: err.message }, 'Supabase audit insert failed; ensure table/schema exists'); }
          }
        } else {
          // Baileys wraps an edit's new content as { editedMessage: { message: <actual content> } },
          // not as the content directly — unwrap that layer before extracting text.
          const editedPayload = update.message?.editedMessage?.message || update.message;
          const newContent = unwrapMessage(editedPayload);
          const newText = extractPreviewText(newContent) || '[No text / media message]';
          const count = (senderEditCounts.get(cached.sender) || 0) + 1;
          senderEditCounts.set(cached.sender, count);
          const note = [
            '✏️ *Message edited*',
            `📍 ${chatLabel}`,
            `👤 Sender: ${name} (${cached.sender.split('@')[0]}${cached.sender.endsWith('@lid') ? ' • LID' : ''})`,
            `🔁 Edited messages from this sender (this session): ${count}`,
            `🕰️ Before: ${cached.text || '[No text / media message]'}`,
            `🆕 After: ${String(newText).slice(0, 2000)}`,
          ].join('\n');
          cached.text = String(newText).slice(0, 2000); // keep cache current for a later delete/edit report
          await sock.sendMessage(owner, { text: note }).catch(err => logger.warn({ err, accountId: id }, 'Anti-edit owner notice failed'));
          if (supabase) {
            try { await supabase.from(process.env.SUPABASE_AUDIT_TABLE || 'bot_audit_events').insert({ account_id: id, event_type: 'message_edited', chat_jid: cached.chat, sender_jid: cached.sender, message_type: cached.type || 'message', message_text: String(newText).slice(0, 2000), created_at: new Date().toISOString() }); }
            catch (err) { logger.warn({ err: err.message }, 'Supabase audit insert failed; ensure table/schema exists'); }
          }
        }
      }
    });
    sock.ev.on('group-participants.update', async event => {
      if ((!settings.welcome && !settings.goodbye) || !event.id) return;
      const meta = await sock.groupMetadata(event.id).catch(() => null);
      if (!meta) return;
      for (const jid of event.participants || []) {
        if (event.action === 'add') await sock.sendMessage(event.id, { text: `👋 Welcome @${jid.split('@')[0]} to *${meta.subject}*!`, mentions: [jid] }).catch(() => {});
        if (event.action === 'remove' && settings.goodbye) await sock.sendMessage(event.id, { text: `👋 @${jid.split('@')[0]} left the group.`, mentions: [jid] }).catch(() => {});
      }
    });
  } catch (err) {
    sockets.delete(id);
    logger.error({ err, accountId: id }, 'Could not start account');
    const attempts = (reconnectAttempts.get(id) || 0) + 1;
    reconnectAttempts.set(id, attempts);
    const delay = Math.min(60000, 3000 * (2 ** Math.min(attempts - 1, 4)));
    clearTimeout(reconnectTimers.get(id));
    reconnectTimers.set(id, setTimeout(() => connectAccount(account), delay));
  }
}

const app = express();
app.get('/', (_req, res) => res.status(200).json({ name: 'DANUWA-MD', status: 'running', connectedAccounts: [...sockets.keys()], mode: settings.mode }));
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', connected: sockets.size, configured: configuredAccounts?.length || 0 }));
const server = app.listen(PORT, '0.0.0.0', () => logger.info(`Health server listening on ${PORT}`));
let configuredAccounts;
try {
  configuredAccounts = readAccounts();
  logger.info({ accounts: configuredAccounts.map(a => a.id) }, 'Configured WhatsApp accounts');
  for (const account of configuredAccounts) connectAccount(account);
} catch (err) {
  logger.error({ err }, 'Invalid account configuration');
  server.close(() => process.exit(1));
}
async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  for (const timer of reconnectTimers.values()) clearTimeout(timer);
  for (const sock of sockets.values()) { try { sock.end(undefined); } catch {} }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
