'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const ids = ['condition-mode-toast', 'sound-mode-toast', 'volume-mode-toast',
    'continuous-mode-toast', 'wake-mode-toast', 'toast-banner'];
  const elements = Object.fromEntries(ids.map(id => [id, {classList: new Set(['show'])}]));
  for (const element of Object.values(elements)) element.classList.remove = element.classList.delete;
  const listeners = [], cancelled = [];
  const context = {
    conditionToastTimer: 1, soundModeToastTimer: 2, volumeModeToastTimer: 3,
    continuousModeToastTimer: 4, wakeModeToastTimer: 5, toastBannerTimer: 6,
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
  for (const volume of [0, 1, 9, 10]) {
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
