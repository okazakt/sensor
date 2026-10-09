'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function sensorFixture() {
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  const elements = { 'unknown-count': { textContent: '' }, 'label-detecting': { textContent: '' }, 'distance-info': { textContent: '' } };
  const records = { arrivals: [] };
  const context = {
    appState: {
      targetMode: "random", sensorDetail: "standard", isTracking: true, isPaused: false,
      currentPos: { lat: 0, lng: 0 }, currentHeading: 0,
      pinpointTarget: null, randomTarget: null, places: []
    },
    RADIUS_OPTIONS: [3000], radiusIndex: 0,
    isSearchInProgress: false, arrivalInProgressId: null,
    radarTimer: null, scheduledInterval: null,
    currentLang: 'ja', I18N: { ja: {
      detecting: '件探知中', detectingLocked: '件探知　対象1件をロック',
      searching: 'SEARCHING...', noSpotsInRange: '範囲内に対象なし', spotDetected: '探知反応あり'
    } },
    document: { getElementById: id => elements[id] },
    loadSavedData: () => records,
    getDistance: (_a, _b, lat) => lat,
    getBearing: () => 0, headingDelta: () => 0,
    updateVisualRing() {}, scheduleRadarSound() {}, clearTimeout() {},
    resetKeywordSearch() {}, executeSearch() {}, handleArrival() {}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function readSensorSetting'),
    source.indexOf('function getSearchCandidates')), context);
  vm.runInContext(source.slice(source.indexOf('function getSearchCandidates'),
    source.indexOf('function scheduleRadarSound')), context);
  return { context, elements, records };
}

test('18件の候補と固定された探知先1件を区別して表示する', () => {
  const { context: c, elements } = sensorFixture();
  c.appState.places = Array.from({ length: 18 }, (_, i) => ({
    id: String(i), lat: 100 + i, lng: 0, rating: i < 8 ? 4.5 : i < 13 ? 2.5 : i < 16 ? 3.5 : undefined
  }));
  c.chooseSearchTarget();
  const fixed = c.appState.randomTarget;
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, 18);
  assert.equal(c.appState.randomTarget, fixed);

  // Legacy rating/hour metadata no longer restricts the new modes.
  c.appState.ratingFilter = 4;
  c.appState.hoursFilter = 2;
  c.chooseSearchTarget();
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, 18);
});

test('件数と対象選択に同じ範囲・除外条件を適用する', () => {
  const { context: c, elements, records } = sensorFixture();
  c.appState.places = [
    { id: 'valid', lat: 100, lng: 0 },
    { id: 'muted', lat: 100, lng: 0 },
    { id: 'outside', lat: 3001, lng: 0 }
  ];
  records.arrivals.push({ id: 'muted', muted: true });
  c.chooseSearchTarget();
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, 1);
  assert.equal(c.appState.randomTarget.id, 'valid');
});

test('検索中は0件と断定せず、指定スポットは1件として表示する', () => {
  const { context: c, elements } = sensorFixture();
  c.isSearchInProgress = true;
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, '--');
  assert.equal(elements['distance-info'].textContent, 'SEARCHING...');
  c.isSearchInProgress = false;
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, 0);
  c.appState.pinpointTarget = { id: 'specified', lat: 100, lng: 0 };
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, 1);
});

test('更新失敗時は固定対象を保持し、停止後の応答を無視する', async () => {
  const { context: c, elements } = sensorFixture();
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  c.searchGeneration = 0;
  c.appState.activeKeyword = 'カフェ';
  elements['target-meta-info'] = { textContent: '' };
  c.I18N.ja.targetMeta = () => 'カフェ';
  c.scheduleCandidateRefresh = () => {};
  c.console = { warn() {} };
  let resolve;
  c.searchGeoapify = () => new Promise(done => { resolve = done; });
  vm.runInContext(source.slice(source.indexOf('async function executeSearch('),
    source.indexOf('function getRadiusText')), c);
  const pending = c.executeSearch();
  resolve({ places: [{ id: 'fixed', lat: 100, lng: 0 }], partial: false });
  await pending;
  assert.equal(c.appState.randomTarget.id, 'fixed');
  c.searchGeoapify = async () => { throw new Error('unavailable'); };
  await c.executeSearch(true);
  assert.equal(c.appState.randomTarget.id, 'fixed');
  assert.equal(elements['unknown-count'].textContent, 1);
  c.searchGeoapify = () => new Promise(done => { resolve = done; });
  const stale = c.executeSearch(true);
  c.searchGeneration++;
  c.appState.isTracking = false;
  resolve({ places: [], partial: false });
  await stale;
  assert.equal(c.appState.places.length, 1);
});

test('検索半径に応じた探知段階の距離境界と方向条件を守る', () => {
  const { context: c } = sensorFixture();
  let observed;
  c.updateVisualRing = level => { observed = { level }; };
  c.scheduleRadarSound = (interval, double) => { Object.assign(observed, { interval, double }); };
  c.handleArrival = () => { observed = { level: 'arrival' }; };
  function detect(radius, distance, angle = 0) {
    c.RADIUS_OPTIONS[0] = radius;
    c.appState.pinpointTarget = { id: 'target', lat: distance, lng: 0 };
    c.headingDelta = () => angle;
    c.evaluateSensorCycle();
    return observed;
  }
  for (const [radius, strong, medium] of [
    [200, 100, 150], [1000, 100, 300], [3000, 300, 900],
    [10000, 1000, 3000], [50000, 5000, 15000], [100000, 10000, 30000]
  ]) {
    assert.equal(detect(radius, 20, 180).level, 'arrival');
    assert.deepEqual(detect(radius, 50, 20), { level: 'level4', interval: 450, double: true });
    assert.deepEqual(detect(radius, 50, 55), { level: 'level3', interval: 800, double: false });
    assert.deepEqual(detect(radius, strong, 35), { level: 'level3', interval: 800, double: false });
    assert.equal(detect(radius, strong + 0.01, 35).level, 'level2');
    assert.deepEqual(detect(radius, medium, 55), { level: 'level2', interval: 1500, double: false });
    assert.equal(detect(radius, medium + 0.01, 55).level, 'level1');
    assert.equal(detect(radius, strong, 35.01).level, 'level2');
    assert.equal(detect(radius, medium, 55.01).level, 'level1');
    assert.equal(detect(radius, medium, 85).level, 'idle');
    assert.equal(detect(radius, 50, 90).level, 'idle');
  }
});

test('最小半径は画面の選択肢と検索処理ともに200m', () => {
  const script = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  const c = {};
  vm.createContext(c);
  vm.runInContext(script.match(/^const RADIUS_OPTIONS = .*;$/m)[0] + '\nthis.minimumRadius = RADIUS_OPTIONS[0];', c);
  assert.equal(c.minimumRadius, 200);
  assert.match(html, /<option value="0">200m<\/option>/);
});

test('最寄りは検索開始時点の位置で選び、移動後もロックを保持する', () => {
  const { context: c } = sensorFixture();
  c.getDistance = (lat, _lng, otherLat) => Math.abs(otherLat - lat);
  c.appState.targetMode = 'nearest';
  c.appState.lastSearchedPos = { lat: 0, lng: 0 };
  c.appState.currentPos = { lat: 250, lng: 0 };
  c.appState.places = [{ id: 'at-search', lat: 100, lng: 0 }, { id: 'now', lat: 300, lng: 0 }];
  c.chooseSearchTarget();
  assert.equal(c.appState.randomTarget.id, 'at-search');
  c.evaluateSensorCycle();
  assert.equal(c.appState.randomTarget.id, 'at-search');
});

test('全件モードは方向を含めた最強の反応を表示し、後方の到着も検出する', () => {
  const { context: c } = sensorFixture();
  c.appState.targetMode = 'all';
  c.appState.places = [{ id: 'behind', lat: 40, lng: 180 }, { id: 'ahead', lat: 200, lng: 0 }];
  c.getBearing = (_lat, _lng, _otherLat, lng) => lng;
  c.headingDelta = (_heading, bearing) => bearing;
  let interval;
  c.scheduleRadarSound = value => { interval = value; };
  c.evaluateSensorCycle();
  assert.equal(c.appState.randomTarget, null);
  assert.equal(interval, 800);
  c.appState.places[0].lat = 10;
  let arrived;
  c.handleArrival = target => { arrived = target.id; };
  c.evaluateSensorCycle();
  assert.equal(arrived, 'behind');
});

test('詳細は距離の中間段階を加え、標準の到着・方向条件を保持する', () => {
  const { context: c } = sensorFixture();
  c.appState.sensorDetail = 'detailed';
  const samples = [2000, 1000, 700, 500, 250, 100, 45, 30];
  const readings = samples.map(distance => c.sensorReaction(distance, 0));
  assert.equal(new Set(readings.map(reading => reading.level)).size, 8);
  for (let i = 1; i < readings.length; i++) {
    assert.ok(readings[i].interval < readings[i - 1].interval);
  }
  assert.equal(c.sensorReaction(30, 90).level, 'idle');
  assert.equal(c.sensorReaction(30, 0).double, true);
});

test('保存したモードを復元し、不正値は既定値に戻す', () => {
  const { context: c } = sensorFixture();
  const saved = { sheikah_target_mode: 'all', sheikah_sensor_detail: 'detailed' };
  c.localStorage = { getItem: key => saved[key] || null };
  assert.equal(c.readSensorSetting('target_mode', ['random', 'nearest', 'all'], 'random'), 'all');
  assert.equal(c.readSensorSetting('sensor_detail', ['standard', 'detailed'], 'standard'), 'detailed');
  saved.sheikah_target_mode = 'invalid';
  assert.equal(c.readSensorSetting('target_mode', ['random', 'nearest', 'all'], 'random'), 'random');
});

test('最寄り・ランダムのロック時だけ件数に対象1件の説明を添える', () => {
  const { context: c, elements } = sensorFixture();
  c.appState.places = [{ id: 'near', lat: 100, lng: 0 }, { id: 'far', lat: 200, lng: 0 }];
  for (const mode of ['nearest', 'random', 'all']) {
    c.appState.targetMode = mode;
    c.chooseSearchTarget();
    c.evaluateSensorCycle();
    assert.equal(elements['unknown-count'].textContent, 2);
    assert.equal(elements['label-detecting'].textContent,
      mode === 'all' ? '件探知中' : '件探知　対象1件をロック');
  }
  c.appState.targetMode = 'nearest';
  c.appState.places = [];
  c.chooseSearchTarget();
  c.evaluateSensorCycle();
  assert.equal(elements['label-detecting'].textContent, '件探知中');
});

test('代表座標が遠くても敷地内なら全件・固定対象のどちらでも到着する', () => {
  for (const mode of ['all', 'nearest']) {
    const { context: c } = sensorFixture();
    const place = { id:'large-park', lat:1000, lng:0, geometry:{type:'Polygon',coordinates:[
      [[-0.01,-0.01],[0.01,-0.01],[0.01,0.01],[-0.01,0.01],[-0.01,-0.01]]
    ]}};
    c.appState.targetMode = mode;
    c.appState.places = [place];
    c.appState.randomTarget = mode === 'all' ? null : place;
    let arrived;
    c.handleArrival = target => { arrived = target.id; };
    c.evaluateSensorCycle();
    assert.equal(arrived,'large-park');
  }
});

test('位置未取得は検索0件と区別して待機・GPSエラーを表示する', () => {
  const {context:c,elements} = sensorFixture();
  c.appState.currentPos = null;
  c.evaluateSensorCycle();
  assert.equal(elements['distance-info'].textContent,'位置情報を取得中...');
  c.lastGpsError = '位置情報の許可を確認してください。';
  c.evaluateSensorCycle();
  assert.equal(elements['distance-info'].textContent,c.lastGpsError);
  assert.equal(elements['unknown-count'].textContent,'--');
  c.appState.currentPos = {lat:0,lng:0};
  c.evaluateSensorCycle();
  assert.equal(elements['distance-info'].textContent,c.lastGpsError);
});
