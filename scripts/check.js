'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const files = ['index.js','command.js','config.js', ...fs.readdirSync(path.join(root,'lib')).filter(f=>f.endsWith('.js')).map(f=>path.join('lib',f)), ...fs.readdirSync(path.join(root,'plugins')).filter(f=>f.endsWith('.js')).map(f=>path.join('plugins',f))];
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root,file)], { encoding:'utf8' });
  if (result.status !== 0) { failed = true; process.stderr.write(`FAIL ${file}\n${result.stderr || result.stdout}`); }
  else process.stdout.write(`OK   ${file}\n`);
}
if (failed) process.exit(1);
process.stdout.write(`\nSyntax checks passed for ${files.length} JavaScript files. This does not verify live WhatsApp or external services.\n`);
