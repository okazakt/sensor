'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');

test('探知音と到着音を繰り返しても終了した音声接続を保持しない', () => {
  const oscillators = [];
  let connections = 0;
  const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  function node() {
    return { connect() { connections++; }, disconnect() { connections--; } };
  }
  const context = {
    appState: { isMuted:false, soundVolume:7 }, navigator: {},
    setTimeout(callback) { callback(); },
    audioCtx: {
      state:'running', currentTime:0, destination:{},
      createOscillator() {
        const oscillator = {...node(), frequency:parameter, start() {}, stop() {}};
        oscillators.push(oscillator);
        return oscillator;
      },
      createGain() { return {...node(), gain:parameter}; }
    }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function playBeep('),
    source.indexOf('const CHALLENGE_GROUPS')), context);
  for (let i = 0; i < 200; i++) {
    context.playBeep();
    context.playTreasureFanfare();
    while (oscillators.length) oscillators.shift().onended();
    assert.equal(connections, 0);
  }
});

test('探知音は70%以下を維持し、最大ではピーク1と短い持続区間を使う', () => {
  const events = [];
  const context = {
    appState: { isMuted: false, soundVolume: 7 },
    audioCtx: {
      state: 'running', currentTime: 2, destination: {},
      createOscillator() {
        return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {}, start() {}, stop() {} };
      },
      createGain() {
        return { connect() {}, gain: {
          setValueAtTime(value, time) { events.push(['set', value, time]); },
          exponentialRampToValueAtTime(value, time) { events.push(['ramp', value, time]); }
        } };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function playBeep('),
    source.indexOf('function playDoubleBeep(')), context);
  for (const volume of [0.5, 3.5, 7, 7.5, 8, 9, 10]) {
    events.length = 0;
    context.appState.soundVolume = volume;
    context.playBeep();
    const peak = events[0][1];
    assert.ok(peak > 0 && peak <= 1);
    if (volume <= 7) {
      assert.equal(peak, 0.55 * (volume / 7));
      assert.equal(events.length, 2);
    } else {
      assert.ok(peak > 0.55 * volume / 7);
      assert.equal(events[1][1], peak);
      assert.ok(events[1][2] > 2 && events[1][2] < 2.12);
    }
    if (volume === 10) assert.equal(peak, 1);
    assert.deepEqual(events.at(-1), ['ramp', 0.001, 2.12]);
  }
  events.length = 0;
  context.appState.isMuted = true;
  context.playBeep();
  assert.equal(events.length, 0);
});
