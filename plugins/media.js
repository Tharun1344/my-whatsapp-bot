'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { cmd } = require('../command');
ffmpeg.setFfmpegPath(ffmpegPath);
async function convert(input, output, video = false) {
  await new Promise((resolve, reject) => {
    let command = ffmpeg(input).outputOptions([
      '-vcodec libwebp', '-vf scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000',
      '-loop 0', '-preset default', '-an', '-vsync 0', '-t 6'
    ]).format('webp').save(output);
    command.on('end', resolve).on('error', reject);
  });
}
cmd({ pattern: 'sticker', alias: ['s', 'stiker'], desc: 'Convert a replied image/video to a WhatsApp sticker', category: 'media' }, async (sock, mek, m, c) => {
  let source = m.quoted || m;
  const type = source.type || '';
  if (!['imageMessage', 'videoMessage'].includes(type)) return c.reply('🖼️ Reply to an image or short video with .sticker');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'danuwa-'));
  const input = path.join(dir, type === 'videoMessage' ? 'input.mp4' : 'input.jpg');
  const output = path.join(dir, 'sticker.webp');
  try {
    const buffer = await source.download();
    if (!buffer?.length) throw new Error('No media bytes received');
    fs.writeFileSync(input, buffer);
    await convert(input, output, type === 'videoMessage');
    await sock.sendMessage(c.from, { sticker: fs.readFileSync(output) }, { quoted: mek });
  } catch (err) {
    console.error('[sticker]', err.message);
    await c.reply('❌ Sticker conversion failed. Try a smaller image or a video under 6 seconds.');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
cmd({ pattern: 'toimage', alias: ['toimg'], desc: 'Convert a replied sticker to PNG', category: 'media' }, async (sock, mek, m, c) => {
  const source = m.quoted;
  if (!source || source.type !== 'stickerMessage') return c.reply('🧩 Reply to a sticker with .toimage');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'danuwa-'));
  const input = path.join(dir, 'input.webp'); const output = path.join(dir, 'image.png');
  try {
    const buffer = await source.download();
    if (!buffer?.length) throw new Error('No sticker bytes received');
    fs.writeFileSync(input, buffer);
    await new Promise((resolve, reject) => ffmpeg(input).output(output).on('end', resolve).on('error', reject).run());
    await sock.sendMessage(c.from, { image: fs.readFileSync(output), caption: '✅ Converted sticker to image.' }, { quoted: mek });
  } catch (err) {
    console.error('[toimage]', err.message);
    await c.reply('❌ Could not convert that sticker.');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
