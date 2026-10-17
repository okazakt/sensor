'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
function fixture() {
  const timers = [], tones = [], animations = [], cancelled = [];
  const wave = {classList: {add: name => animations.push(name)}};
  const context = {
    appState: {pulseRate: 'max', isTracking: true, isPaused: false},
    radarTimer: null, scheduledInterval: null,
    setTimeout(fn, delay) { timers.push({fn, delay}); return timers.length; },
    clearTimeout: id => cancelled.push(id),
    playRadarSonar: stage => tones.push(stage),
    document: {getElementById: () => wave}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function scheduleRadarSound('), source.indexOf('async function handleArrival(')), context);
  return {context, timers, tones, animations, cancelled};
}
test('approved sonars and visual pulse types follow normal/intermediate bands at all three rates', () => {
  for (const interval of [2600, 1500, 800, 450, 2050, 1150, 625, 350]) {
    for (const [mode, factor] of [['max', 1], ['mid', 2], ['low', 4]]) {
      for (const double of [false, true]) {
        const {context: c, timers, tones, animations} = fixture();
        c.appState.pulseRate = mode;
        c.scheduleRadarSound(interval, double);
        assert.equal(timers[0].delay, interval * factor);
        assert.equal(tones[0], double ? 'close' : interval <= 900 ? 'near' : 'normal');
        assert.equal(animations[0], double ? 'pulse-double-anim' : 'pulse-anim');
      }
    }
  }
});
test('changing rate replaces the running cycle and pause stops repeating', () => {
  const {context: c, timers, cancelled} = fixture();
  c.scheduleRadarSound(800);
  c.scheduleRadarSound(800);
  assert.equal(timers.length, 1);
  c.appState.pulseRate = 'mid';
  c.scheduleRadarSound(800);
  assert.deepEqual(cancelled, [1]);
  assert.equal(timers[1].delay, 1600);
  c.appState.isPaused = true;
  timers[1].fn();
  assert.equal(c.radarTimer, null);
  assert.equal(c.scheduledInterval, null);
  assert.equal(timers.length, 2);
});
