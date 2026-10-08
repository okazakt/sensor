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
