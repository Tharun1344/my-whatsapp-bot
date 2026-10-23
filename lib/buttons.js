'use strict';
// Best-effort "link button" helper.
//
// WhatsApp link buttons (native-flow "cta_url" buttons) are not guaranteed to
// render on every WhatsApp client/version, and @whiskeysockets/baileys does
// not expose a simple `buttons` option for them the way some forks do — they
// have to be built as a raw interactive-message payload. Because of that,
// every call here is wrapped so that if building/sending the interactive
// message fails for any reason, we silently fall back to a normal text
// message instead of crashing the command.
const { proto, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

/**
 * Send `text` with up to 3 tappable "Open link" buttons when possible.
 * Always falls back to a plain text message with the same content if the
 * interactive message can't be built or the send is rejected.
 *
 * @param {object} sock - active Baileys socket
 * @param {string} jid - chat to send to
 * @param {string} text - message body (should already read fine as plain text too)
 * @param {{label:string,url:string}[]} links - link buttons to attach (max 3 used)
 */
async function sendWithLinkButtons(sock, jid, text, links = []) {
  const buttons = (links || [])
    .filter(l => l && l.url)
    .slice(0, 3)
    .map(l => ({
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: String(l.label || 'Open').slice(0, 25),
        url: l.url,
        merchant_url: l.url,
      }),
    }));
  if (!buttons.length) return sock.sendMessage(jid, { text });
  try {
    const content = {
      interactiveMessage: proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons }),
      }),
    };
    const waMessage = generateWAMessageFromContent(jid, content, { userJid: sock.user?.id });
    await sock.relayMessage(jid, waMessage.message, { messageId: waMessage.key.id });
    return waMessage;
  } catch (err) {
    console.warn('[buttons] interactive send failed, falling back to plain text:', err.message);
    return sock.sendMessage(jid, { text });
  }
}

module.exports = { sendWithLinkButtons };
