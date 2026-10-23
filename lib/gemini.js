'use strict';
// Minimal Gemini client (native generateContent API). Used by .ai and .vision.
const axios = require('axios');

function config() {
  return {
    key: process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '',
    base: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
    model: process.env.AI_MODEL || 'gemini-3.5-flash-lite',
    visionModel: process.env.AI_VISION_MODEL || process.env.AI_MODEL || 'gemini-3.5-flash-lite',
  };
}

const SYSTEM = 'You are Dobby-Md, a helpful WhatsApp assistant. Reply in the same language the user writes in (Sinhala, Singlish or English). Keep answers clear and reasonably short for a chat app. Do not use markdown headings or tables.';

async function generate({ model, contents, system = SYSTEM, maxOutputTokens = 1024, timeout = 60000 }) {
  const { key, base } = config();
  if (!key) { const e = new Error('NO_KEY'); e.code = 'NO_KEY'; throw e; }
  const res = await axios.post(`${base}/models/${model}:generateContent`, {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens },
  }, { headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, timeout, maxBodyLength: 25_000_000 });
  const cand = res.data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map(p => p.text || '').join('').trim();
  if (!text) {
    const reason = res.data?.promptFeedback?.blockReason || cand?.finishReason || 'EMPTY';
    const e = new Error(`EMPTY:${reason}`); e.code = 'EMPTY'; e.reason = reason; throw e;
  }
  return text;
}

// Short-lived per-chat memory for .ai follow-ups.
const history = new Map();
const MAX_TURNS = 8, TTL_MS = 30 * 60 * 1000;
function getHistory(chat) {
  const h = history.get(chat);
  if (!h || Date.now() - h.at > TTL_MS) { history.delete(chat); return []; }
  return h.turns;
}
function pushHistory(chat, role, text) {
  const turns = getHistory(chat).concat({ role, parts: [{ text: String(text).slice(0, 3000) }] }).slice(-MAX_TURNS);
  history.set(chat, { at: Date.now(), turns });
  if (history.size > 300) history.delete(history.keys().next().value);
}
function clearHistory(chat) { history.delete(chat); }

function explainError(e) {
  if (e.code === 'NO_KEY') return '🤖 Gemini API key එක set කරලා නැහැ. GEMINI_API_KEY (හෝ AI_API_KEY) variable එක දාන්න.';
  if (e.code === 'EMPTY') return `⚠️ AI එකෙන් පිළිතුරක් ආවේ නැහැ (${e.reason}). වෙනස් විදිහකට අහලා බලන්න.`;
  const status = e.response?.status;
  const apiMsg = e.response?.data?.error?.message;
  console.error('[gemini]', status || e.code || '', apiMsg || e.message);
  if (status === 400 && /API key/i.test(apiMsg || '')) return '❌ Gemini API key එක වැරදියි. aistudio.google.com එකෙන් අලුත් key එකක් හදලා දාන්න.';
  if (status === 401 || status === 403) return '❌ Gemini key එක reject වුණා (401/403). Key එක Google AI Studio එකෙන් ගත්ත එකක්ද කියලා බලන්න.';
  if (status === 404) return `❌ Model එක හොයාගන්න බැහැ (404). AI_MODEL variable එකේ model name එක පරීක්ෂා කරන්න (දැන්: ${config().model}).`;
  if (status === 429) return '⏳ Gemini rate limit / quota ඉවරයි. ටිකක් ඉඳලා ආයෙ try කරන්න.';
  return `❌ AI request අසාර්ථකයි${status ? ` (HTTP ${status})` : ''}.`;
}

module.exports = { config, generate, getHistory, pushHistory, clearHistory, explainError, SYSTEM };
