'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const context = {
    map: { setCenter() {} }, appState: { isWalking: false },
    lastMapPositionFix: null, visualMapCenter: null, mapCenterTarget: null,
    mapPositionJump: null, mapCenterMotion: null, mapCenterFrame: null,
    mapCenterIsMoving: false, performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    getDistance: (a, b, c, d) => Math.hypot(c - a, d - b) * 111000,
    getBearing: () => 0
  };
  const source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
  vm.runInNewContext(source.slice(source.indexOf('function updateMapPositionSmoothly('),
    source.indexOf('function bootstrapMapAndLocation(')), context);
  return { context, fix: (metres, time, accuracy = 10) => context.updateMapPositionSmoothly({
    latitude: metres / 111000, longitude: 139, accuracy, speed: null, heading: null
  }, time) };
}

test('train fixes without speed recover from a jump while continuing to move', () => {
  const { context, fix } = fixture();
  fix(0, 0);
  fix(100, 1000);
  assert.equal(context.mapCenterTarget.lat, 0);
  fix(150, 2000);
  assert.equal(context.mapCenterTarget.lat, 150 / 111000);
  fix(200, 3000);
  assert.equal(context.mapCenterTarget.lat, 200 / 111000);
});

test('coarse transport fixes update the display without predicting motion', () => {
  const { context, fix } = fixture();
  fix(0, 0);
  fix(100, 1000, 100);
  assert.equal(context.mapCenterTarget.lat, 100 / 111000);
  assert.equal(context.mapCenterMotion, null);
  fix(200, 2000, 1500);
  assert.equal(context.mapCenterTarget.lat, 100 / 111000);
});

test('isolated implausible jumps remain unconfirmed', () => {
  const { context, fix } = fixture();
  fix(0, 0);
  fix(10000, 1000);
  fix(20000, 2000);
  assert.equal(context.mapCenterTarget.lat, 0);
  fix(5, 3000);
  assert.equal(context.mapCenterTarget.lat, 5 / 111000);
});
