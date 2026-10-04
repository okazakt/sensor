'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function sensorFixture() {
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  const elements = { 'unknown-count': { textContent: '' }, 'distance-info': { textContent: '' } };
  const records = { arrivals: [] };
  const context = {
    appState: {
      hoursFilter: 0, ratingFilter: 0, isTracking: true, isPaused: false,
      currentPos: { lat: 0, lng: 0 }, currentHeading: 0,
      pinpointTarget: null, randomTarget: null, places: []
    },
    RADIUS_OPTIONS: [3000], radiusIndex: 0,
    isSearchInProgress: false, arrivalInProgressId: null,
    radarTimer: null, scheduledInterval: null,
    currentLang: 'ja', I18N: { ja: {
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
  vm.runInContext(source.slice(source.indexOf('function readConditionSetting'),
    source.indexOf('async function loadSearchHours')), context);
  vm.runInContext(source.slice(source.indexOf('function getSearchCandidates'),
    source.indexOf('function scheduleRadarSound')), context);
  return { context, elements, records };
}

test('18件の候補と固定された探知先1件を区別して表示する', () => {
  const { context: c, elements } = sensorFixture();
  c.appState.places = Array.from({ length: 18 }, (_, i) => ({
    id: String(i), lat: 100 + i, lng: 0, rating: i < 8 ? 4.5 : i < 13 ? 2.5 : i < 16 ? 3.5 : undefined
  }));
  c.chooseRandomTarget();
  const fixed = c.appState.randomTarget;
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, 18);
  assert.equal(c.appState.randomTarget, fixed);

  c.appState.ratingFilter = 4; // Rating 4 or higher, excluding unknown.
  c.chooseRandomTarget();
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, 8);
  assert.equal(c.appState.randomTarget.rating, 4.5);

  c.appState.ratingFilter = 8; // Unknown rating or below 3.
  c.chooseRandomTarget();
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, 7);
  assert.ok(c.appState.randomTarget.rating === undefined || c.appState.randomTarget.rating < 3);

  c.appState.ratingFilter = 0;
  c.chooseRandomTarget();
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, 18);
});

test('件数と対象選択に同じ範囲・除外・営業時間条件を適用する', () => {
  const { context: c, elements, records } = sensorFixture();
  c.appState.places = [
    { id: 'valid', lat: 100, lng: 0 },
    { id: 'muted', lat: 100, lng: 0 },
    { id: 'outside', lat: 3001, lng: 0 },
    { id: 'closed', lat: 100, lng: 0, openingHours: { isOpen: () => false } }
  ];
  records.arrivals.push({ id: 'muted', muted: true });
  c.appState.hoursFilter = 4; // Unknown hours only.
  c.chooseRandomTarget();
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

test('5分タイマーで候補を更新し、固定対象を保持する。停止中はAPIを呼ばない', async () => {
  const { context: c, elements } = sensorFixture();
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  const timers = [];
  let callback;
  let requests = 0;
  c.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
  c.searchGeneration = 0;
  c.appState.activeKeyword = 'ラーメン';
  elements['target-meta-info'] = { textContent: '' };
  c.I18N.ja.targetMeta = () => 'ラーメン / 3km';
  c.google = { maps: {
    LatLng: function () {},
    places: { PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' } }
  } };
  c.placesService = { textSearch: (_request, done) => { requests++; callback = done; } };
  c.loadSearchHours = async () => {};
  c.console = { warn() {} };
  vm.runInContext(source.slice(source.indexOf('const CANDIDATE_REFRESH_MS'),
    source.indexOf('function readConditionSetting')), c);
  vm.runInContext(source.slice(source.indexOf('function executeSearch('),
    source.indexOf('function getRadiusText')), c);
  const result = (id, lat = 100) => ({
    place_id: id, name: id, rating: 4.5,
    geometry: { location: { lat: () => lat, lng: () => 0 } }
  });
  c.executeSearch();
  await callback([result('fixed')], 'OK');
  assert.equal(requests, 1);
  assert.equal(c.appState.randomTarget.id, 'fixed');
  assert.equal(timers.at(-1).delay, 300000);

  timers.at(-1).fn();
  assert.equal(requests, 2);
  c.evaluateSensorCycle();
  assert.equal(elements['unknown-count'].textContent, 1); // Detection continues during refresh.
  await callback([result('fixed'), result('new')], 'OK');
  assert.equal(elements['unknown-count'].textContent, 2);
  assert.equal(c.appState.randomTarget.id, 'fixed');

  timers.at(-1).fn();
  await callback([], 'REQUEST_DENIED');
  assert.equal(elements['unknown-count'].textContent, 2);
  assert.equal(c.appState.randomTarget.id, 'fixed');

  const previous = requests;
  c.appState.isPaused = true;
  timers.at(-1).fn();
  assert.equal(requests, previous);
  c.appState.isPaused = false;
  c.appState.isTracking = false;
  timers.at(-1).fn();
  assert.equal(requests, previous);
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
