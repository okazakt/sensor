#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ASSETS = ['style.css', 'script.js', 'app-storage.js', 'rewarded-ads.js', 'geoapify-config.js', 'applixir-config.js', 'runtime-diagnostics.js'];
function synchronize(root = path.resolve(__dirname, '..'), { check = false } = {}) {
  const htmlPath = path.join(root, 'index.html');
  const original = fs.readFileSync(htmlPath, 'utf8');
  let html = original;
  for (const asset of ASSETS) {
    const source = fs.readFileSync(path.join(root, asset));
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reference = new RegExp(escaped + '(?:\\?v=[^"\'\\s<>]+)?', 'g');
    if (!reference.test(html)) throw new Error(`Missing HTML reference: ${asset}`);
    reference.lastIndex = 0;
    html = html.replace(reference, `${asset}?v=${hash}`);
  }
  if (html === original) return false;
  if (check) throw new Error('Asset URLs are out of sync. Run node scripts/sync-asset-versions.cjs');
  html = html.replace(/(<meta name="html-rev" content=")(\d+)(">)/,
    (_, before, rev, after) => before + String(Number(rev) % 99 + 1).padStart(2, '0') + after);
  fs.writeFileSync(htmlPath, html);
  return true;
}
if (require.main === module) {
  synchronize(undefined, { check: process.argv.includes('--check') });
}
module.exports = { synchronize, ASSETS };
