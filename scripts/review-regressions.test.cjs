'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
function fixture() {
  const c = { TextEncoder, TextDecoder, Uint8Array, btoa, atob };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function validDestinationGeometry'), source.indexOf('function destinationGeometryReading')), c);
  vm.runInContext(source.slice(source.indexOf('function encodeTransferData'), source.indexOf('async function triggerDataTransferPrompt')), c);
  return c;
}
test('引き継ぎコードは旧UTF-8形式と互換で、日本語・絵文字を保持する', () => {
  const c = fixture();
  const json = JSON.stringify({ keywordHistory: { '喫茶☕': {} }, arrivals: [] });
  const legacy = btoa(unescape(encodeURIComponent(json)));
  assert.equal(c.encodeTransferData(json), legacy);
  assert.equal(c.decodeTransferData(legacy), json);
  assert.throws(() => c.decodeTransferData('/w=='));
});
test('不正な復元データを拒否し、旧keyword形式を許容する', () => {
  const c = fixture();
  const item = { id: 'spot', name: '喫茶', lat: 35, lng: 139, keyword: 'cafe' };
  assert.equal(c.isValidTransferData({ arrivals: [item] }), true);
  for (const db of [null, [], { arrivals: {} }, { arrivals: [null] },
    { arrivals: [{ ...item, name: {} }] }, { arrivals: [{ ...item, keywords: [null] }] },
    { arrivals: [{ ...item, challengeIds: {} }] }, { arrivals: [{ ...item, lat: 91 }] },
    { arrivals: [{ ...item, geometry: { type: 'Polygon', coordinates: null } }] },
    { arrivals: [], keywordHistory: { cafe: null } }, { arrivals: [], completedChallenges: {} },
    JSON.parse('{"arrivals":[],"keywordHistory":{"__proto__":{}}}')]) {
    assert.equal(c.isValidTransferData(db), false, JSON.stringify(db));
  }
});
test('load発火の前後いずれでも起動でき、更新リロード待ちは初期化しない', () => {
  const code = source.slice(source.indexOf('function initializeOnLoad()'));
  for (const readyState of ['loading', 'interactive', 'complete']) {
    for (const pending of [false, true]) {
      let handler; let boots = 0; let modals = 0;
      const c = { startupRefreshPending: pending, bootstrapMapAndLocation() { boots++; },
        checkAndShowStartupModals() { modals++; }, document: { readyState },
        window: { addEventListener(event, fn, options) {
          assert.equal(event, 'load'); assert.equal(options.once, true); handler = fn;
        } } };
      vm.runInNewContext(code, c);
      if (readyState !== 'complete') { assert.equal(boots, 0); handler(); }
      assert.equal(boots, pending ? 0 : 1); assert.equal(modals, pending ? 0 : 1);
    }
  }
});
test('探索履歴のキーワードはHTML本文・属性内で文字列として表示される', () => {
  let row;
  const key = '<img src=x onerror=alert(1)>" autofocus onfocus="alert(2)';
  const c = { loadSavedData: () => ({ keywordHistory: { [key]: {} }, arrivals: [] }),
    currentLang: 'ja', I18N: { ja: { arrivalCount: n => String(n) } },
    document: { getElementById: id => id === 'keyword-filter' ? { value: '' } :
      id === 'sort-keywords' ? { value: 'recent_search' } : { appendChild(el) { row = el; } },
      createElement: () => ({ dataset: {}, addEventListener() {}, querySelector: () => ({ addEventListener() {} }) }) } };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function escapeHtml'), source.indexOf('function applyLanguage')), c);
  vm.runInContext(source.slice(source.indexOf('function renderKeywordsList'), source.indexOf("document.getElementById('btn-delete-zero-keywords')", source.indexOf('function renderKeywordsList'))), c);
  c.renderKeywordsList();
  assert.equal(row.dataset.keyword, key);
  assert.ok(!row.innerHTML.includes('<img'));
  assert.ok(row.innerHTML.includes('data-key="&lt;img'));
  assert.ok(row.innerHTML.includes('&quot; autofocus onfocus=&quot;'));
});
