'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
function fixture() {
  let now = 100000;
  const elements = Object.fromEntries(['label-detecting', 'label-unvisited', 'unknown-count'].map(id => [id, { textContent: id === 'unknown-count' ? '3' : '', hidden: false }]));
  const c = { Date: { now: () => now }, lastLocationFixTime: 0,
    appState: { lastCompassTimestamp: null, isTracking: true, isPaused: false, targetMode: 'all' },
    currentLang: 'ja', I18N: { ja: { detecting: '件探知中', detectingLocked: 'ロック', locationInfoMissing: '位置', compassInfoMissing: '方位', sensorInfoMissing: '両方' },
      en: { detecting: 'detected', sensorInfoMissing: 'Both unavailable' } },
    document: { visibilityState: 'visible', getElementById: id => elements[id] } };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('const SENSOR_INFO_NOTICE_DELAY'), source.indexOf('function sensorReaction')), c);
  vm.runInContext(source.slice(source.indexOf('function updateDetectionLabel'), source.indexOf('function evaluateSensorCycle')), c);
  return { c, elements, time(value) { now = value; }, start() { vm.runInContext('sensorInfoMonitoringSince = Date.now()', c); } };
}
test('開始前は表示せず、20秒連続で未取得の場合だけ件数欄を切り替える', () => {
  const f = fixture(); f.c.updateDetectionLabel();
  assert.equal(f.elements['unknown-count'].hidden, false);
  f.start(); f.time(119999); f.c.updateDetectionLabel();
  assert.equal(f.elements['label-detecting'].textContent, '件探知中');
  f.time(120000); f.c.updateDetectionLabel();
  assert.equal(f.elements['label-detecting'].textContent, '両方');
  assert.equal(f.elements['unknown-count'].hidden, true);
  assert.equal(f.elements['label-unvisited'].hidden, true);
  f.c.lastLocationFixTime = 120000; f.c.updateDetectionLabel();
  assert.equal(f.elements['label-detecting'].textContent, '方位');
  f.c.appState.lastCompassTimestamp = 120000; f.c.updateDetectionLabel();
  assert.equal(f.elements['unknown-count'].hidden, false);
  assert.equal(f.elements['unknown-count'].textContent, '3');
  f.time(140000); f.c.appState.lastCompassTimestamp = 140000; f.c.updateDetectionLabel();
  assert.equal(f.elements['label-detecting'].textContent, '位置');
});
test('正常な更新で待ち時間をリセットし、精度が低いだけでは警告しない', () => {
  const f = fixture(); f.start(); f.time(119000);
  f.c.lastLocationFixTime = 119000; f.c.appState.lastCompassTimestamp = 119000;
  f.c.appState.compassAccuracy = 50;
  f.time(138999); assert.equal(f.c.sensorInfoNotice(), '');
  f.time(139000); assert.equal(f.c.sensorInfoNotice(), '両方');
});
test('非表示中は警告せず、復帰後は古い情報でも20秒待つ', () => {
  const f = fixture(); f.start(); f.time(150000);
  f.c.document.visibilityState = 'hidden'; assert.equal(f.c.sensorInfoNotice(), '');
  let handler;
  f.c.document.addEventListener = (event, fn) => { handler = fn; };
  const start = source.indexOf('// Refresh the notice');
  const listener = source.indexOf("document.addEventListener('visibilitychange'", start);
  vm.runInContext(source.slice(listener, source.indexOf('\n});', listener) + 4), f.c);
  handler(); f.time(300000); f.c.document.visibilityState = 'visible'; handler();
  f.time(319999); assert.equal(f.c.sensorInfoNotice(), '');
  f.time(320000); assert.equal(f.c.sensorInfoNotice(), '両方');
  f.c.currentLang = 'en'; f.c.updateDetectionLabel();
  assert.equal(f.elements['label-detecting'].textContent, 'Both unavailable');
});
