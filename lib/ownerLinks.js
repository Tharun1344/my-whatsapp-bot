'use strict';
const config = require('../config');

function validUrl(url) {
  if (!url) return '';
  try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) ? url : ''; }
  catch { return ''; }
}

// Single source of truth for the owner's contact/social links, used by
// both .alive and .menu (as text lines and as tappable link buttons).
function getOwnerLinks() {
  return [
    { emoji: '🐙', label: 'GitHub', url: validUrl(config.OWNER_GITHUB) },
    { emoji: '🌐', label: 'Website', url: validUrl(config.OWNER_WEBSITE) },
    { emoji: '💬', label: 'WhatsApp', url: validUrl(config.OWNER_WHATSAPP) || (config.BOT_OWNER ? `https://wa.me/${String(config.BOT_OWNER).replace(/\D/g, '')}` : '') },
    { emoji: '📘', label: 'Facebook', url: validUrl(config.OWNER_FACEBOOK) },
    { emoji: '📸', label: 'Instagram', url: validUrl(config.OWNER_INSTAGRAM) },
  ].filter(l => l.url);
}

function ownerLinkLines(links = getOwnerLinks()) {
  return links.map(l => `${l.emoji} *${l.label}:* ${l.url}`);
}

module.exports = { getOwnerLinks, ownerLinkLines };
