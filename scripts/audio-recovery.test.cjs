'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
function fixture() {
  const contexts = [], timers = new Map(), listeners = {};
  const c = {
    appState:{soundMode:'speaker', isMuted:false}, navigator:{audioSession:{type:'playback'}},
    document:{hidden:false, addEventListener:(name, fn) => {listeners[name] = fn;}},
    window:{addEventListener:(name, fn) => {listeners[name] = fn;}},
    Audio:class {play() {return Promise.resolve();} pause() {this.paused = true;}},
    stopSelectedSounds() {},
    setTimeout(fn) {const id = {}; timers.set(id, fn); return id;},
    clearTimeout(id) {timers.delete(id);}
  };
  c.window.AudioContext = class {
    constructor() {this.state = 'suspended'; this.currentTime = 0; contexts.push(this);}
    resume() {this.resumed = true; this.state = 'running'; return Promise.resolve();}
    close() {this.state = 'closed'; return Promise.resolve();}
    createBuffer() {return {};}
    createBufferSource() {return {connect() {}, start() {}};}
  };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('let audioCtx = null;'), source.indexOf('function startCompassListening(')), c);
  return {c, contexts, timers, listeners};
}
test('speaker selection and foreground return replace the old output and restore playback', () => {
  const {c, contexts, listeners} = fixture();
  c.recoverAudioOutput(true);
  assert.equal(contexts.length, 1);
  listeners.visibilitychange();
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0].state, 'closed');
  assert.equal(contexts[1].state, 'running');
  assert.equal(c.navigator.audioSession.type, 'playback');
});
test('stalled clock retries once; advancing clock keeps its engine', () => {
  for (const advances of [false, true]) {
    const {c, contexts, timers} = fixture();
    c.recoverAudioOutput();
    if (advances) contexts[0].currentTime = 0.5;
    const [id, callback] = [...timers][0]; timers.delete(id); callback();
    assert.equal(contexts.length, advances ? 1 : 2);
    assert.equal(timers.size, 0);
  }
});
test('hidden and muted states cancel recovery and release silent playback', () => {
  const {c, contexts, timers, listeners} = fixture();
  c.recoverAudioOutput();
  const silent = vm.runInContext('silentAudioElement', c);
  c.document.hidden = true; listeners.visibilitychange();
  assert.equal(timers.size, 0);
  c.document.hidden = false; c.appState.soundMode = 'muted'; c.initAudio();
  assert.equal(silent.paused, true);
  assert.equal(contexts[0].state, 'closed');
  listeners.visibilitychange();
  assert.equal(contexts.length, 1);
  assert.equal(c.navigator.audioSession.type, 'transient');
});
test('interrupted context retries on a user gesture and catches a rejected resume', async () => {
  const {c, contexts, listeners} = fixture();
  c.initAudio();
  contexts[0].state = 'interrupted';
  let resumed = false;
  contexts[0].resume = () => {resumed = true; return Promise.reject(new Error('blocked'));};
  listeners.pointerdown();
  await Promise.resolve();
  assert.equal(resumed, true);
});
