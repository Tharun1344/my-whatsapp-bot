# Test report — DANUWA-MD v1.3.0

## Verified in this environment
- `node scripts/check.js`: passed JavaScript syntax checks for 14 project source files.
- Checked that `.alive`, `.menu`, downloader commands, owner-only `.autoreact` settings, and auto-reaction event hook are present in source.
- Fixed a duplicate `const statusCode` declaration that made the earlier `index.js` invalid JavaScript.
- Removed duplicate auto-reaction insertion and duplicate owner command registration.
- Original uploaded ZIP remains untouched; this is a separate revision.

## Not verified / blockers
- `npm install --omit=dev --no-audit --no-fund` timed out in this environment, so runtime dependency loading was not verified.
- `yt-dlp` is not installed in the current test environment; Dockerfile now installs and upgrades it during image build.
- No real YouTube/Facebook/TikTok download, multi-gigabyte document upload, WhatsApp pairing, group operation, Railway deployment, Supabase write, or AI API request was performed.
- `OWNER_WEBSITE`, `OWNER_FACEBOOK`, and `OWNER_INSTAGRAM` are blank by default because exact URLs were not available in the source; set them in Railway Variables. `OWNER_WHATSAPP` may be omitted if `BOT_OWNER` is configured.
- WhatsApp/document size limits, Railway storage and memory limits, and platform download restrictions can still prevent very large downloads.
- View-once media is not saved or bypassed; the bot only sends a notice.
