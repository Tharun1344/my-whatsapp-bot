'use strict';
const { cmd } = require('../command');
const g = require('../lib/gemini');

cmd({ pattern: 'vision', alias: ['describe', 'whatinimage', 'scan', 'analyze', 'analyse'], desc: 'Gemini vision: reply to an image with .vision [question] (or send image with it as caption)', category: 'ai' }, async (_s, _m, m, c) => {
  const { key, visionModel } = g.config();
  if (!key) return c.reply(g.explainError({ code: 'NO_KEY' }));
  const source = m.quoted || m;
  if (source.type !== 'imageMessage') return c.reply('🖼️ Image එකකට reply කරලා .vision [ප්‍රශ්නය] යවන්න (නැත්නම් image එක caption එකට .vision දාලා යවන්න). View-once media process කරන්නේ නැහැ.');
  try {
    const buffer = await source.download();
    if (!buffer?.length || buffer.length > 15_000_000) return c.reply('⚠️ Image එක හිස් හෝ 15 MB ඉක්මවයි.');
    const mime = source.msg?.mimetype || 'image/jpeg';
    const prompt = c.q || 'Describe this image in detail. Reply in Sinhala.';
    const answer = await g.generate({
      model: visionModel,
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: buffer.toString('base64') } }] }],
      maxOutputTokens: 1200, timeout: 90000,
    });
    await c.reply(answer.slice(0, 5000));
  } catch (e) { await c.reply(g.explainError(e)).catch(() => {}); }
});
