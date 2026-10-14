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
  const context = { window: {},
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
    updateDestinationOutlines() {}, updateVisualRing() {}, scheduleRadarSound() {}, clearTimeout() {},
    resetKeywordSearch() {}, executeSearch() {}, handleArrival() {}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function readSensorSetting'),
    source.indexOf('function getSearchCandidates')), context);
  vm.runInContext(source.slice(source.indexOf('function getSearchCandidates'),
    source.indexOf('function scheduleRadarSound')), context);
  return { context, elements, records };
}

test('ランダムチャレンジは圏外を優先し、候補がなければ到着圏内から抽選する', () => {
  const { context: c } = sensorFixture();
  c.appState.activeChallenge = { mode: 'random' };
  c.appState.places = [0, 19, 20, 20.01].map(lat => ({ id: String(lat), lat, lng: 0 }));
  vm.runInContext('Math.random = () => 0', c);
  for (let i = 0; i < 10; i++) {
    c.appState.randomTarget = null;
    c.chooseSearchTarget();
    assert.equal(c.appState.randomTarget.id, '20.01');
  }
  c.appState.places.pop();
  c.chooseSearchTarget();
  assert.equal(c.appState.randomTarget.id, '0');
  vm.runInContext('Math.random = () => 0.999', c);
  c.chooseSearchTarget();
  assert.equal(c.appState.randomTarget.id, '20');
  let arrived = false;
  c.handleArrival = () => { arrived = true; };
  c.evaluateSensorCycle();
  assert.equal(arrived, true);
  c.appState.places = [];
  c.chooseSearchTarget();
  assert.equal(c.appState.randomTarget, null);
});

test('選択後の移動では到着でき、後から判明した開始時点の敷地内は選び直す', () => {
  const { context: c } = sensorFixture();
  c.appState.activeChallenge = { mode: 'random' };
  c.getDistance = (lat, _lng, otherLat) => Math.abs(otherLat - lat);
  const place = { id: 'park', lat: 100, lng: 0 };
  c.appState.places = [place, { id: 'other', lat: 200, lng: 0 }];
  vm.runInContext('Math.random = () => 0', c);
  c.chooseSearchTarget();
  c.appState.currentPos = { lat: 90, lng: 0 };
  let arrived;
  c.handleArrival = target => { arrived = target.id; };
  c.evaluateSensorCycle();
  assert.equal(arrived, 'park');
  c.appState.currentPos = { lat: 0, lng: 0 };
  place.geometry = { type: 'Polygon', coordinates: [
    [[-0.01,-0.01],[0.01,-0.01],[0.01,0.01],[-0.01,0.01],[-0.01,-0.01]]
  ] };
  c.maintainSearchTarget();
  assert.equal(c.appState.randomTarget.id, 'other');
  c.appState.places = [place];
  c.chooseSearchTarget();
  c.evaluateSensorCycle();
  assert.equal(arrived, 'park');
});

test('通常のランダム探索と最寄りチャレンジは到着圏内も選択できる', () => {
  const { context: c } = sensorFixture();
  c.appState.places = [{ id: 'nearby', lat: 10, lng: 0 }];
  c.chooseSearchTarget();
  assert.equal(c.appState.randomTarget.id, 'nearby');
  c.appState.activeChallenge = { mode: 'nearest' };
  c.appState.targetMode = 'nearest';
  c.chooseSearchTarget();
  assert.equal(c.appState.randomTarget.id, 'nearby');
});

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

test('射程内は検索せず、射程外で一度再検索し、指定スポット・停止中は検索しない', () => {
  const { context: c } = sensorFixture();
  c.getDistance = (lat,_lng,otherLat) => Math.abs(otherLat-lat);
  c.appState.lastSearchedPos = {lat:0,lng:0};
  c.appState.randomTarget = {id:'target',lat:100,lng:0};
  c.appState.places = [c.appState.randomTarget];
  let calls = 0;
  c.executeSearch = refresh => { assert.equal(refresh,true); calls++; };
  c.appState.currentPos = {lat:3100,lng:0};
  c.refreshOutOfRangeTargets({lat:0,lng:0});
  assert.equal(calls,0);
  c.appState.currentPos = {lat:3101,lng:0};
  c.refreshOutOfRangeTargets({lat:3100,lng:0});
  c.refreshOutOfRangeTargets({lat:3100,lng:0});
  assert.equal(calls,1);
  assert.equal(c.appState.randomTarget,null);
  c.appState.randomTarget = {id:'other',lat:0,lng:0};
  c.appState.pinpointTarget = c.appState.randomTarget;
  c.refreshOutOfRangeTargets({lat:0,lng:0});
  c.appState.pinpointTarget = null;
  c.appState.isPaused = true;
  c.refreshOutOfRangeTargets({lat:0,lng:0});
  assert.equal(calls,1);
});
test('全対象は最後の候補が射程外になった時だけ再検索する', () => {
  const { context: c } = sensorFixture();
  c.getDistance = (lat,_lng,otherLat) => Math.abs(otherLat-lat);
  c.appState.targetMode = 'all';
  c.appState.lastSearchedPos = {lat:0,lng:0};
  c.appState.places = [{id:'a',lat:100,lng:0},{id:'b',lat:200,lng:0}];
  let calls = 0;
  c.executeSearch = () => { calls++; };
  c.appState.currentPos = {lat:3101,lng:0};
  c.refreshOutOfRangeTargets({lat:0,lng:0});
  assert.equal(calls,0);
  c.appState.currentPos = {lat:3201,lng:0};
  c.refreshOutOfRangeTargets({lat:3101,lng:0});
  c.refreshOutOfRangeTargets({lat:3101,lng:0});
  assert.equal(calls,1);
});
test('全対象の詳細取得は最寄りの未到達候補だけで、移動すると対象が切り替わる', () => {
  const { context:c, records } = sensorFixture();
  c.getDistance = (lat,_lng,otherLat)=>Math.abs(otherLat-lat);
  c.appState.targetMode = 'all';
  c.appState.places = [{id:'muted',lat:30,lng:0},{id:'near',lat:100,lng:0},{id:'far',lat:200,lng:0}];
  records.arrivals = [{id:'muted',muted:true}];
  const requested = [];
  c.requestDestinationGeometry = place => requested.push(place.id);
  c.evaluateSensorCycle();
  assert.deepEqual(requested,['near']);
  c.appState.currentPos = {lat:300,lng:0};
  c.evaluateSensorCycle();
  assert.deepEqual(requested,['near','far']);
});
test('更新失敗時は固定対象を保持し、停止後の応答を無視する', async () => {
  const { context: c, elements } = sensorFixture();
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  c.searchGeneration = 0;
  c.appState.activeKeyword = 'カフェ';
  elements['target-meta-info'] = { textContent: '' };
  c.I18N.ja.targetMeta = () => 'カフェ';
  c.console = { warn() {} };
  let resolve;
  c.searchGeoapify = () => new Promise(done => { resolve = done; });
  vm.runInContext(source.slice(source.indexOf('async function executeSearch('),
    source.indexOf('function getRadiusText')), c);
  const pending = c.executeSearch(false, true);
  resolve({ places: [{ id: 'fixed', lat: 100, lng: 0 }], partial: false });
  await pending;
  assert.equal(c.appState.randomTarget.id, 'fixed');
  c.searchGeoapify = async () => { throw new Error('unavailable'); };
  await c.executeSearch(true, true);
  assert.equal(c.appState.randomTarget.id, 'fixed');
  assert.equal(elements['unknown-count'].textContent, 1);
  c.searchGeoapify = () => new Promise(done => { resolve = done; });
  const stale = c.executeSearch(true, true);
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

test('探知判定は保存データを一度だけ読み、IndexedDB時は軽い探知一覧だけを使う', () => {
  for (const indexed of [false, true]) {
    const { context: c, records } = sensorFixture();
    let reads = 0, detectionReads = 0, outlineUpdates = 0;
    c.loadSavedData = () => { reads++; return records; };
    c.updateDestinationOutlines = () => { outlineUpdates++; };
    c.requestDestinationGeometry = () => {};
    c.appState.places = [{ id:'target', lat:1000, lng:0 }];
    if (indexed) c.window.SensorAppStorage = { detection() { detectionReads++; return records.arrivals; } };
    c.evaluateSensorCycle();
    assert.equal(reads, indexed ? 0 : 1);
    assert.equal(detectionReads, indexed ? 1 : 0);
    assert.equal(outlineUpdates, 0);
  }
});
