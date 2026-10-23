'use strict';
const { cmd } = require('../command');
const g = require('../lib/gemini');

cmd({ pattern: 'ai', alias: ['ask', 'gemini', 'chatgpt'], desc: 'Ask Gemini (.ai your question | reply to a message to include it | .ai reset)', category: 'ai' }, async (_s, _m, m, c) => {
  const { key, model } = g.config();
  if (!key) return c.reply(g.explainError({ code: 'NO_KEY' }));
  let q = c.q;
  if (/^(reset|clear)$/i.test(q)) { g.clearHistory(c.from); return c.reply('🧹 AI chat history clear කළා.'); }
  const quotedText = m.quoted?.msg?.conversation || m.quoted?.msg?.text || m.quoted?.msg?.caption || (typeof m.quoted?.msg === 'string' ? m.quoted.msg : '');
  if (!q && !quotedText) return c.reply('💬 භාවිතය: .ai ඔයාගේ ප්‍රශ්නය\nහෝ message එකකට reply කරලා .ai');
  if (quotedText) q = `${q || 'Explain / respond to this message:'}\n\n"""${String(quotedText).slice(0, 3000)}"""`;
  try {
    const contents = g.getHistory(c.from).concat({ role: 'user', parts: [{ text: q }] });
    const answer = await g.generate({ model, contents });
    g.pushHistory(c.from, 'user', q);
    g.pushHistory(c.from, 'model', answer);
    await c.reply(answer.slice(0, 6000));
  } catch (e) { await c.reply(g.explainError(e)).catch(() => {}); }
});
