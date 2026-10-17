'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const ids = ['condition-mode-toast', 'sound-mode-toast', 'volume-mode-toast',
    'pulse-rate-toast', 'wake-mode-toast', 'toast-banner'];
  const elements = Object.fromEntries(ids.map(id => [id, {classList: new Set(['show'])}]));
  for (const element of Object.values(elements)) element.classList.remove = element.classList.delete;
  const listeners = [], cancelled = [];
  const context = {
    conditionToastTimer: 1, soundModeToastTimer: 2, volumeModeToastTimer: 3,
    pulseRateToastTimer: 4, wakeModeToastTimer: 5, toastBannerTimer: 6,
    clearTimeout: id => cancelled.push(id),
    document: {getElementById: id => elements[id], addEventListener: (...args) => listeners.push(args)}
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function hideOtherSettingToasts'), source.indexOf('function showWakeModeToast')), context);
  return {context, elements, listeners, cancelled};
}

test('外側タップで全通知と古い終了タイマーを消す', () => {
  const {context: c, elements, cancelled} = fixture();
  c.dismissToastsOnOutsideTap({target: {closest: () => null}});
  assert.ok(Object.values(elements).every(element => !element.classList.has('show')));
  assert.deepEqual(cancelled, [1, 2, 3, 4, 5, 6]);
  assert.equal(c.toastBannerTimer, null);
});

test('タップの捕捉時に旧通知を消し、ボタンが表示する新通知は保持する', () => {
  const {elements, listeners} = fixture();
  const click = listeners.find(([event]) => event === 'click');
  assert.equal(click[2], true);
  click[1]({target: {closest: () => null}});
  elements['volume-mode-toast'].classList.add('show');
  assert.deepEqual(Object.entries(elements).filter(([, el]) => el.classList.has('show')).map(([id]) => id), ['volume-mode-toast']);
});

test('音量ボタン連打は音量通知を閉じず、他の通知を閉じる', () => {
  const {context: c, elements} = fixture();
  const toast = elements['volume-mode-toast'];
  let removals = 0;
  toast.classList.remove = () => { removals++; };
  for (let i = 0; i < 3; i++) {
    c.dismissToastsOnOutsideTap({target: {closest: selector =>
      selector.includes('#volume-down-btn') ? {disabled: false} : null}});
  }
  assert.equal(removals, 0);
  assert.ok(toast.classList.has('show'));
  assert.ok(Object.entries(elements).every(([id, el]) => id === 'volume-mode-toast' || !el.classList.has('show')));
});

test('音量更新は20本の棒を再利用し、最後の操作から1秒で消える', () => {
  const {context: c, elements} = fixture();
  const bars = Array.from({length: 20}, () => ({classList: {toggle(_, active) { this.active = active; }}}));
  const value = {};
  const toast = elements['volume-mode-toast'];
  toast.querySelectorAll = () => bars;
  toast.querySelector = () => value;
  const timers = new Map();
  let nextId = 10;
  c.setTimeout = (callback, delay) => { timers.set(++nextId, {callback, delay}); return nextId; };
  c.clearTimeout = id => timers.delete(id);
  c.appState = {soundVolume: 1};
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function showVolumeModeToast()'), source.indexOf('function changeSoundVolume')), c);
  for (const volume of [0.5, 1, 7.5, 9.5, 10]) {
    c.appState.soundVolume = volume;
    c.showVolumeModeToast();
    assert.equal(value.textContent, `${volume * 10}%`);
    assert.equal(bars.filter(bar => bar.classList.active).length, volume * 2);
    assert.equal(timers.size, 1);
    assert.ok(toast.classList.has('show'));
  }
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 1000);
  timer.callback();
  assert.ok(!toast.classList.has('show'));
});


test('音量は5%刻みの20段階で保存され、上下限を超えない', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  const saved = [];
  const playing = {output:{gain:{value:0}}};
  const c = {appState: {soundVolume: 0.5, isMuted: false}, selectedSoundVoices:new Set([playing]),
    localStorage: {setItem: (_, value) => saved.push(value)},
    playRadarSonar(stage, echoLevel) { assert.equal(stage, 'near'); assert.equal(echoLevel, 1); }, showVolumeModeToast() {}};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function changeSoundVolume'), source.indexOf("document.getElementById('volume-down-btn')", source.indexOf('function changeSoundVolume'))), c);
  c.changeSoundVolume(-1);
  assert.equal(c.appState.soundVolume, 0.5);
  for (let level = 2; level <= 20; level++) {
    c.changeSoundVolume(1);
    assert.equal(c.appState.soundVolume * 10, level * 5);
    assert.equal(Number(saved.at(-1)), level / 2);
    assert.equal(playing.output.gain.value, c.appState.soundVolume / 7);
  }
  c.changeSoundVolume(1);
  assert.equal(c.appState.soundVolume, 10);
  c.changeSoundVolume(-1);
  assert.equal(c.appState.soundVolume, 9.5);
  c.appState.isMuted = true;
  c.changeSoundVolume(-1);
  assert.equal(c.appState.soundVolume, 9.5);
});

test('保存した5%刻みの値と以前の10%刻みの値を読み込める', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  const loader = source.slice(source.indexOf('let savedSoundVolume ='), source.indexOf('let savedSoundVolume =') + source.slice(source.indexOf('let savedSoundVolume =')).indexOf('\n}', 0) + 2);
  for (const [stored, expected] of [['7', 7], ['7.5', 7.5], ['0.5', 0.5], ['10', 10], [null, 7], ['bad', 7], ['0', 7], ['10.5', 7], ['1.2', 7]]) {
    const c = {localStorage: {getItem: () => stored}};
    vm.createContext(c);
    vm.runInContext(loader + '\nthis.loaded = savedSoundVolume;', c);
    assert.equal(c.loaded, expected);
  }
});
