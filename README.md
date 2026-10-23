# DANUWA-MD — improved starter (v1.3.0)

Baileys-based WhatsApp bot. The original uploaded archive contained only the connection scaffold, command registry, helper functions, and `.alive` / `.menu` plugins. Group, media, owner controls, anti-delete notices, optional AI, optional Supabase audit logging, and downloader commands have been added in this revision.

## Commands

- `.menu`, `.alive`, `.ping`
- Group: `.groupinfo`, `.tagall [message]`, `.kick`, `.promote`, `.demote`, `.grouplink`, `.revoke`, `.mute on/off`
- Media: `.sticker` (reply to image/short video), `.toimage` (reply to sticker)
- Downloads: `.ytsearch <query>`; `.ytvideo <name|URL>` (YouTube 480p), `.song <name|URL>` (MP3), `.fbvideo <URL>` (up to 720p), `.ttvideo <URL>` (up to 720p), `.download <name|URL>` (up to 720p; uses system `yt-dlp`)
- Owner: `.mode public/private`, `.welcome on/off`, `.goodbye on/off`, `.antidelete on/off`, `.autoreact on/off`, `.autoreact set ❤️`, `.accounts`
- Optional AI: `.ai <question>` and `.vision [question]` (reply to a normal image)

Group-changing commands require group admin privileges and usually bot admin privileges. `tagall` requires sender or bot owner privileges in the current implementation. WhatsApp may reject actions according to group role/rules.

## Original vs added

The original ZIP only had a basic Baileys connection, helper functions, `.alive`, and `.menu`. It did **not** include working downloader commands, group-management plugins, AI integration, Supabase integration, multi-account orchestration, anti-delete handling, or Railway volume guidance. Those have been added as code, but must still be configured and runtime-tested in your environment.

## Local run and checks

Requires Node.js 20 or 22, npm, FFmpeg, and `yt-dlp` for media conversion/download commands.

```sh
npm install
npm run check
npm start
```

If there is no saved session, the terminal displays a QR. Scan it with WhatsApp → Linked devices → Link a device. Keep session folders private; they grant access to the linked WhatsApp account.

## Railway deployment

This project uses a Dockerfile that installs Node.js, FFmpeg and `yt-dlp`.

1. Push the project to a **private** GitHub repository. Never commit session folders, `.env`, `config.env`, or secret keys.
2. Create a Railway service from the repository.
3. Add a Railway Volume mounted at `/data`; set `STORAGE_DIR=/data`.
4. Add variables listed in `.env.example`, especially `BOT_OWNER` and optionally `BOT_ACCOUNTS`.
5. Deploy and check `/health`.
6. Pair each account separately. For stable restarts, each account's full Baileys auth directory must be persisted under `/data/sessions/<id>/` (or legacy `/data/auth_info_baileys/`).

Example `BOT_ACCOUNTS` JSON value (replace numbers; do not include `+`):

```json
[{"id":"main","ownerNumber":"YOUR_NUMBER","sessionId":""},{"id":"work","ownerNumber":"YOUR_NUMBER","sessionId":""}]
```

Each account uses a separate session directory. The QR code must be paired for each account. Multiple accounts share the same process and settings; this is not a web dashboard.

## Optional Supabase audit logging

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Railway Variables and run `supabase-schema.sql` in the Supabase SQL editor. The service-role key must never be shared or committed. The current Supabase integration writes anti-delete event text/metadata to `bot_audit_events`; it does **not** store WhatsApp auth/session credentials in Supabase. Bot settings are stored in the persistent filesystem JSON file.

## Optional AI

Set `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, and optionally `AI_VISION_MODEL` to a compatible chat-completions provider. AI features are disabled until configured. Provider costs/limits depend on the provider. `.vision` only processes regular image messages, not view-once media.

## Downloader and legal note

The downloader uses system `yt-dlp`. `.ytvideo` accepts a title or URL and targets up to 480p; `.song` creates MP3; `.fbvideo` and `.ttvideo` target up to 720p for supported URLs. Downloads are sent as documents. Default cap: 1,900,000,000 bytes. Platform restrictions, source changes, file size, network, or hosting limits may still cause failures.

## Anti-delete and view-once behavior

Anti-delete notices are on by default and can be toggled with `.antidelete on/off`. The bot caches a limited number of ordinary messages in memory while online and sends an owner notice if a revoke event is observed. It does not guarantee media recovery, cannot recover messages sent while offline, and its in-memory cache is lost on restart. If Supabase is configured, deletion event text/metadata may also be written to the audit table.

**View-once media is intentionally not saved, downloaded, or bypassed.** The bot only sends the owner a notice that view-once media was received. The sender should resend the image normally if they want it to be retained.

## Important limitations / verification status

- `npm run check` passed in the build environment.
- `npm install` did not complete within the available execution window; dependency installation and runtime smoke tests therefore remain unverified.
- No live WhatsApp pairing, group operation, Railway deployment, Supabase request, or AI provider request was run here.
- The original ZIP did not contain a full Baileys auth directory. Existing session data was not present in the uploaded archive to preserve. `SESSION_ID` imports only a single `creds.json` payload and is not a complete multi-file auth backup; prefer pairing or migrating the full session directory securely.
- Railway persistent volume is essential. Health endpoint success alone does not prove WhatsApp is connected; `/` lists connected account IDs.
- WhatsApp Web automation is unofficial and may be restricted by WhatsApp. Use responsibly and keep session credentials private.


## v1.3.0 UX and downloader improvements

- `.alive` is a styled emoji card and shows configured GitHub, website, WhatsApp, Facebook, and Instagram links with readable labels. Set `OWNER_WEBSITE`, `OWNER_WHATSAPP`, `OWNER_FACEBOOK`, and `OWNER_INSTAGRAM` to your actual links; missing links are hidden. GitHub defaults to the known profile handle from the project context. `.menu` uses emoji categories and decorated command entries.
- `.ytvideo <song/video name or URL>` searches by name or downloads a direct URL, targeting up to 480p.
- `.song <song name or URL>` extracts MP3 audio.
- `.fbvideo <URL>` and `.ttvideo <URL>` target up to 720p where yt-dlp/source formats support it. `.download` is a generic supported-source fallback.
- Downloads are sent as WhatsApp documents, not inline media. The configurable default limit is 1,900,000,000 bytes (below the nominal 2 GB document limit). Very large downloads can still fail because Railway memory, temporary disk, network timeouts, source availability, or Baileys transport limits vary. The file-path media source is used to avoid manually reading the whole file into a JS Buffer.
- `.autoreact on/off` and `.autoreact set ❤️` are owner-only settings stored in the persistent settings file. It reacts to non-command incoming messages when enabled. Reactions can fail for unsupported messages or WhatsApp transport changes.
- `.alive` uses labels and links rather than relying on raw unlabelled URLs. WhatsApp text messages cannot create arbitrary custom hyperlink labels on every client, so the actual URLs may remain visible as part of the card.

## Downloader troubleshooting

The old implementation used `--max-filesize` with a 45 MB cap and only accepted direct URLs. That explains why many YouTube videos failed. This revision raises the yt-dlp pre-check to the configured ~1.9 GB cap, supports YouTube name searches and direct URLs, chooses height-limited formats, and checks actual file size after download. Update yt-dlp regularly in the Docker image. Not every source is guaranteed: platform changes, private/age/geo/login-protected videos, removed content, rate limits, and unavailable formats may still fail. Only download content you own or have permission to download and follow the platform's terms.

## Testing status

Run `npm run check` for cross-platform JavaScript syntax checks. This does not prove successful installation, actual YouTube/Facebook/TikTok download, media upload of multi-gigabyte files, WhatsApp pairing, or Railway runtime. Those need to be tested on the target service.

## v1.4 changes
- **Anti-delete / anti-edit**: notices now always go to the linked account's own self-chat (no `BOT_OWNER` needed). Shows group name, sender, before/after text.
- **Group admin check fixed** for LID-addressed groups (`.kick`, `.promote`, `.tagall`… no longer say "make the bot an admin first" when the bot *is* admin).
- **Gemini only**: `.ai` (with short chat memory, `.ai reset`) and `.vision` use Gemini's native API. Set `GEMINI_API_KEY`; model defaults to `gemini-3.5-flash-lite` (override with `AI_MODEL` / `AI_VISION_MODEL`).
- **Scheduled messages** (owner only): `.schedule 18:30 | hello`, `.schedule 2h | 9477xxxxxxx | hi`, `.schedules`, `.unschedule <id>`. Times are Sri Lanka time; stored in `data/schedules.json` (use a persistent volume on Railway).
