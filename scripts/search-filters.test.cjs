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
