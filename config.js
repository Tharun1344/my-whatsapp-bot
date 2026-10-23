'use strict';
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });
else require('dotenv').config();
module.exports = {
  SESSION_ID: process.env.SESSION_ID || '',
  ALIVE_IMG: process.env.ALIVE_IMG || '',
  ALIVE_MSG: process.env.ALIVE_MSG || 'ආයුබෝවන් 👋 Dobby is online !',
  BOT_OWNER: process.env.BOT_OWNER || '',
  OWNER_NAME: process.env.OWNER_NAME || 'Tharun Prabashwara',
  OWNER_GITHUB: process.env.OWNER_GITHUB || 'https://github.com/tharunprabashwara642-dot',
  OWNER_WEBSITE: process.env.OWNER_WEBSITE || 'https://tharun-liard.vercel.app/',
  OWNER_WHATSAPP: process.env.OWNER_WHATSAPP || 'https://wa.me/94707915458',
  OWNER_FACEBOOK: process.env.OWNER_FACEBOOK || 'https://www.facebook.com/share/1F7ZFB6jsy/?mibextid=wwXIfr',
  OWNER_INSTAGRAM: process.env.OWNER_INSTAGRAM || '',
  BOT_NAME: process.env.BOT_NAME || 'Dobby-Md',
  // Shown once to a new private chat the first time it messages the bot. Leave blank to use the built-in default.
  GREETING_MSG: process.env.GREETING_MSG || '',
};
