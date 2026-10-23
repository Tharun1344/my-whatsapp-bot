'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(process.env.STORAGE_DIR || path.join(__dirname, '..'), 'data', 'settings.json');
exports.save = function save(settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.renameSync(tmp, file);
};
exports.getFile = () => file;
