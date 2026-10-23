'use strict';
const { cmd } = require('../command');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
let ffmpegStaticPath = null;
try { ffmpegStaticPath = require('ffmpeg-static'); } catch { ffmpegStaticPath = null; }
const MAX_BYTES = Math.max(10 * 1024 * 1024, Math.min(Number(process.env.MAX_DOWNLOAD_BYTES || 1900000000), 1900000000));
const URL_RE = /^https?:\/\//i;
const LIMIT_LABEL = `${(MAX_BYTES / (1024 ** 3)).toFixed(2)} GiB`;
// Extensions yt-dlp can produce with no video track at all. If a non-audio
// command ends up with one of these, the source only offered audio (or the
// video+audio merge silently failed) — report it instead of sending an
// audio file labeled as a video.
const AUDIO_ONLY_EXT = new Set(['mp3', 'm4a', 'aac', 'opus', 'ogg', 'wav', 'wma', 'weba']);
function runYtDlp(args, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.YTDLP_BIN || 'yt-dlp', args, { stdio: ['ignore','pipe','pipe'] });
    let stdout = '', stderr = '', settled = false;
    const done = (err, value) => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolve(value); };
    child.stdout.on('data', x => { stdout += x.toString(); if (stdout.length > 300000) stdout = stdout.slice(-300000); });
    child.stderr.on('data', x => { stderr += x.toString(); if (stderr.length > 300000) stderr = stderr.slice(-300000); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); done(new Error('Download timed out')); }, timeoutMs);
    child.on('error', err => done(new Error(`Could not start yt-dlp: ${err.message}`)));
    child.on('close', code => code === 0 ? done(null, { stdout, stderr }) : done(new Error(stderr.slice(-1800) || `yt-dlp exited ${code}`)));
  });
}
function safeName(name, fallback) { return String(name || fallback).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 160) || fallback; }
function inputTarget(q, searchPrefix = 'ytsearch1:') {
  const raw = String(q || '').trim();
  if (!raw) throw new Error('Give a video/song name or URL.');
  if (URL_RE.test(raw)) {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only HTTP(S) URLs are allowed.');
    return u.toString();
  }
  return searchPrefix + raw;
}
async function sendAsDocument(sock, c, file, title, ext, mime) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_BYTES) throw new Error(`File is larger than configured limit ${LIMIT_LABEL}`);
  // Baileys accepts a file path as media URL; avoid loading multi-GB files into RAM.
  await sock.sendMessage(c.from, {
    document: { url: file },
    mimetype: mime,
    fileName: safeName(`${title}.${ext}`, `download.${ext}`),
    caption: `✅ *Download complete*\n📦 Sent as document\n📏 ${(stat.size / (1024 * 1024)).toFixed(1)} MB`
  }, { quoted: c.quoted });
}
async function downloadCommand(sock, mek, _msg, c, mode) {
  let target;
  try {
    if (mode.urlOnly && !URL_RE.test(String(c.q || '').trim())) throw new Error('This platform command requires a direct video URL.');
    target = inputTarget(c.q, 'ytsearch1:');
  }
  catch (e) { return c.reply(`📥 *භාවිතය*\n${c.prefix}${mode.command} video/song name OR URL\n\nඋදා: ${c.prefix}${mode.command} Shape of You\nඋදා: ${c.prefix}${mode.command} https://...`); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'danuwa-dl-'));
  try {
    await c.reply(`⏳ *${mode.label}* සූදානම් කරනවා…\n🔎 Name එකක් හෝ URL එකක් දෙන්න පුළුවන්.\n📦 Document ලෙස යවනවා; configured limit: ${LIMIT_LABEL}.`);
    const out = path.join(dir, '%(title).150B.%(ext)s');
    const common = ['--no-playlist','--no-warnings','--newline','--socket-timeout','30','--retries','3','--fragment-retries','3','--no-part','--max-filesize',String(MAX_BYTES),'-o',out,'--print','after_move:filepath'];
    // Without a working ffmpeg, yt-dlp can't merge a separate video+audio
    // pair and silently drops to whatever single-file format is available —
    // which for some sources (e.g. Facebook) can end up audio-only. Pointing
    // explicitly at ffmpeg-static makes the merge reliable regardless of
    // what's on PATH.
    if (ffmpegStaticPath) common.push('--ffmpeg-location', ffmpegStaticPath);
    let args;
    if (mode.audio) {
      args = [...common, '-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0', target];
    } else {
      // 480p YouTube; 720p for other supported services. bv*/ba (rather than
      // the bestvideo/bestaudio aliases) are the more reliable yt-dlp
      // selectors across sources that don't tag every format with a height.
      const format = mode.height === 720
        ? 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b'
        : 'b[height<=480][ext=mp4]/bv*[height<=480]+ba/b[height<=480]/b[ext=mp4]/b';
      args = [...common, '-f', format, '--merge-output-format', 'mp4', target];
    }
    const { stdout, stderr } = await runYtDlp(args, Number(process.env.DOWNLOAD_TIMEOUT_MS || 600000));
    const printed = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
    let file = printed && fs.existsSync(printed) ? printed : null;
    if (!file) {
      const candidates = fs.readdirSync(dir).map(n => path.join(dir,n)).filter(p => fs.existsSync(p) && fs.statSync(p).isFile());
      file = candidates.sort((a,b) => fs.statSync(b).size - fs.statSync(a).size)[0] || null;
    }
    if (!file) throw new Error(`No file created. ${stderr.slice(-500)}`);
    const stat = fs.statSync(file);
    if (stat.size > MAX_BYTES) throw new Error(`File too large: ${(stat.size / (1024 ** 3)).toFixed(2)} GiB; limit ${LIMIT_LABEL}`);
    const ext = path.extname(file).slice(1).toLowerCase() || (mode.audio ? 'mp3' : 'mp4');
    if (!mode.audio && AUDIO_ONLY_EXT.has(ext)) {
      throw new Error(`AUDIO_ONLY_RESULT: this link only yielded an audio track (ext=${ext}), no video.`);
    }
    const title = path.basename(file, path.extname(file));
    const mime = mode.audio ? 'audio/mpeg' : (ext === 'webm' ? 'video/webm' : ext === 'mkv' ? 'video/x-matroska' : 'video/mp4');
    await sendAsDocument(sock, c, file, title, ext, mime);
  } catch (e) {
    console.error(`[${mode.command}]`, e.message);
    let message = '❌ Download එක අසාර්ථකයි.';
    if (/AUDIO_ONLY_RESULT/i.test(e.message)) message = '⚠️ මේ link එකට *video stream එකක් නැහැ* — audio track එකක් විතරයි හම්බුණේ, ඒ නිසා video file එක යැව්වේ නැහැ.\n🔁 වෙනත් post/link එකක් try කරන්න, හෝ video එක login/age/geo restricted වෙලා තියෙනවද බලන්න.';
    else if (/max-filesize|file is larger|too large/i.test(e.message)) message += `\n📏 File size limit: ${LIMIT_LABEL}. Railway memory/storage limits නිසා ඉතා විශාල files fail වෙන්න පුළුවන්.`;
    else if (/yt-dlp|ENOENT|not found/i.test(e.message)) message += '\n🧰 yt-dlp install/update කරලා තියෙනවද බලන්න.';
    else if (/timed out/i.test(e.message)) message += '\n⏱️ Download timeout වුණා; පොඩි video එකක් හෝ පසුව නැවත try කරන්න.';
    else message += '\n🌐 Link availability, login/age/geo restrictions සහ source platform changes පරීක්ෂා කරන්න.';
    message += '\n⚠️ ඔබට download කිරීමට අයිතිය ඇති content පමණක් භාවිත කරන්න.';
    await c.reply(message);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
cmd({ pattern: 'ytsearch', alias: ['musicsearch','videosearch'], desc: 'Search YouTube results (metadata only)', category: 'download' }, async (_s,_m,_msg,c) => {
  if (!c.q) return c.reply(`🔎 භාවිතය: ${c.prefix}ytsearch song/video name`);
  try {
    const { stdout } = await runYtDlp(['--dump-single-json','--flat-playlist','--no-warnings',`ytsearch5:${c.q}`], 60000);
    const data = JSON.parse(stdout);
    const entries = (data.entries || []).slice(0,5);
    if (!entries.length) return c.reply('😕 ප්‍රතිඵල හමු වුණේ නැහැ.');
    return c.reply('╭─〔 🔎 *YOUTUBE SEARCH* 〕\n' + entries.map((v,i)=>`│ ${i+1}. *${v.title || 'Untitled'}*\n│ 🔗 https://www.youtube.com/watch?v=${v.id}`).join('\n│\n') + '\n╰────────────────\n\n⬇️ Video: .ytvideo song name\n🎵 MP3: .song song name');
  } catch (e) { console.error('[ytsearch]',e.message); return c.reply('❌ Search අසාර්ථකයි. yt-dlp update/network එක පරීක්ෂා කරන්න.'); }
});
cmd({ pattern: 'ytvideo', alias: ['ytmp4'], desc: 'Download YouTube video up to 480p by name or URL', category: 'download' }, async (s,m,msg,c) => downloadCommand(s,m,msg,c,{command:'ytvideo',label:'YouTube video (480p)',height:480}));
cmd({ pattern: 'song', alias: ['ytmp3','mp3'], desc: 'Download permitted audio as MP3 by name or URL', category: 'download' }, async (s,m,msg,c) => downloadCommand(s,m,msg,c,{command:'song',label:'Song MP3',audio:true}));
cmd({ pattern: 'fbvideo', alias: ['facebook'], desc: 'Download supported Facebook video up to 720p', category: 'download' }, async (s,m,msg,c) => downloadCommand(s,m,msg,c,{command:'fbvideo',label:'Facebook video (up to 720p)',height:720,urlOnly:true}));
cmd({ pattern: 'ttvideo', alias: ['tiktok'], desc: 'Download supported TikTok video up to 720p', category: 'download' }, async (s,m,msg,c) => downloadCommand(s,m,msg,c,{command:'ttvideo',label:'TikTok video (up to 720p)',height:720,urlOnly:true}));
cmd({ pattern: 'download', alias: ['media'], desc: 'Download supported public video by name or URL (up to 720p)', category: 'download' }, async (s,m,msg,c) => downloadCommand(s,m,msg,c,{command:'download',label:'Video download (up to 720p)',height:720}));
