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
