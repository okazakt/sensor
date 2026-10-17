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
    let outgoing = 0;
    return { connect() { connections++; outgoing++; }, disconnect() { connections -= outgoing; outgoing = 0; } };
  }
  const context = {
    appState: { isMuted:false, soundVolume:7 }, navigator: {},
    setTimeout(callback) { callback(); }, clearTimeout() {},
    audioCtx: {
      state:'running', currentTime:0, destination:{},
      createOscillator() {
        const oscillator = {...node(), frequency:parameter, start() {}, stop() {}};
        oscillators.push(oscillator);
        return oscillator;
      },
      createGain() { return {...node(), gain:parameter}; },
      createDelay() { return {...node(), delayTime:{value:0}}; },
      createBiquadFilter() { return {...node(), frequency:{value:0}}; }
    }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function playBeep('),
    source.indexOf('const CHALLENGE_GROUPS')), context);
  for (let i = 0; i < 200; i++) {
    context.playBeep();
    context.playTreasureFanfare();
    context.playRadarSonar('close');
    context.playSelectedFanfare(true);
    context.playChallengePlaceCue();
    assert.equal(oscillators.length, 54);
    while (oscillators.length) oscillators.shift().onended();
    assert.equal(connections, 0);
    assert.equal(vm.runInContext('selectedSoundVoices.size', context), 0);
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

test('ミュートは採用音の予約音・エコーを即座に切断し、以降の場所名の音も生成しない', () => {
  const nodes = [], oscillators = [], timers = new Map();
  let connections = 0, sequence = 0;
  const parameter = () => ({value:0, setValueAtTime() {}, exponentialRampToValueAtTime() {}});
  function node() {
    let outgoing = 0;
    const n = {connect() { connections++; outgoing++; }, disconnect() { connections -= outgoing; outgoing = 0; }};
    nodes.push(n); return n;
  }
  const c = {appState:{soundMode:'headphone', isMuted:false, soundVolume:7}, navigator:{},
    setTimeout(fn) {timers.set(++sequence,fn); return sequence;}, clearTimeout(id) {timers.delete(id);},
    audioCtx:{state:'running', currentTime:0, destination:{},
      createGain:()=>({...node(),gain:parameter()}), createDelay:()=>({...node(),delayTime:parameter()}),
      createBiquadFilter:()=>({...node(),frequency:parameter()}),
      createOscillator() {const n={...node(),frequency:parameter(),start(){},stop(){this.stopped=true;}};oscillators.push(n);return n;}
    }};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function playBeep('), source.indexOf('const CHALLENGE_GROUPS')), c);
  vm.runInContext(source.slice(source.indexOf('function initAudio('), source.indexOf('function startCompassListening(')), c);
  c.playRadarSonar('close'); c.playSelectedFanfare(true);
  assert.equal(oscillators.length,19);
  assert(connections>0);
  c.appState.soundMode='muted'; c.initAudio();
  assert.equal(connections,0);
  assert(oscillators.every(n=>n.stopped&&n.onended===null));
  assert.equal(vm.runInContext('selectedSoundVoices.size',c),0);
  assert.equal(timers.size,0);
  const count=nodes.length;
  c.playChallengePlaceCue(); c.playRadarSonar('normal');
  assert.equal(nodes.length,count);
});
