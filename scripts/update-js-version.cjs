#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function versionForDate(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    year: '2-digit', month: 'numeric', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `v0.${values.year}.${Number(values.month)}1.${values.day}${values.hour}${values.minute}`;
}

if (require.main === module) {
  const scriptPath = path.resolve(__dirname, '../script.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  const pattern = /^const BASE_JS_VERSION = "v0\.\d{2}\.\d{1,2}1\.\d{6}";$/m;
  if (!pattern.test(source)) {
    throw new Error('BASE_JS_VERSIONが見つからないか、採番形式が異なります。');
  }
  const version = versionForDate(new Date());
  fs.writeFileSync(scriptPath, source.replace(pattern, `const BASE_JS_VERSION = "${version}";`));
  console.log(`BASE_JS_VERSION: ${version} (Asia/Tokyo)`);
}

module.exports = { versionForDate };
