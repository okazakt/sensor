'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').resolve(__dirname, '../script.js'), 'utf8');
function fixture() {
  const elements = {};
  for (const id of ['label', 'name', 'state', 'place']) {
    elements[`challenge-presentation-${id}`] = {textContent: '', hidden: false};
  }
  const classes = new Set();
  elements['challenge-presentation'] = {offsetWidth: 390, classList: {
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
  }};
  const timers = new Map();
  let timerId = 0;
  const context = {currentLang: 'ja', appState: {isMuted: true}, challengeName: c => c.name,
    document: {getElementById: id => elements[id]},
    setTimeout: (fn, delay) => {timers.set(++timerId, {fn, delay}); return timerId;},
    clearTimeout: id => timers.delete(id)};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('let challengePresentationTimer'), source.indexOf('function startChallenge(')), context);
  function next() {
    assert.equal(timers.size, 1);
    const [id, timer] = timers.entries().next().value;
    timers.delete(id);
    timer.fn();
    return timer.delay;
  }
  return {context, elements, classes, timers, next};
}
test('COMPLETEを先に表示し、到着文を読む時間を確保してからゆっくり消す', () => {
  const {context: c, elements, classes, next} = fixture();
  c.showChallengePresentation({name: 'グルメ1km最寄り'}, true, {name: 'トワサンク'});
  assert.equal(elements['challenge-presentation-state'].textContent, 'COMPLETE');
  assert.equal(elements['challenge-presentation-place'].hidden, true);
  assert.equal(next(), 4400);
  assert.equal(elements['challenge-presentation-state'].hidden, false);
  assert.equal(elements['challenge-presentation-state'].textContent, 'COMPLETE');
  assert.equal(elements['challenge-presentation-name'].hidden, false);
  assert.equal(elements['challenge-presentation-name'].textContent, 'グルメ1km最寄り');
  assert.equal(elements['challenge-presentation-label'].textContent, 'チャレンジ');
  assert(classes.has('is-complete'));
  assert.equal(elements['challenge-presentation-place'].textContent, 'トワサンクへの到達を記録しました');
  assert.equal(elements['challenge-presentation-place'].hidden, false);
  assert.equal(next(), 6500);
  assert(classes.has('is-visible'));
  assert(classes.has('is-leaving'));
  assert.equal(next(), 1400);
  assert(!classes.has('is-visible'));
});
test('長い到着場所は表示時間を延ばし、新しい開始通知は以前の続きと終了タイマーを取り消す', () => {
  const {context: c, elements, classes, timers} = fixture();
  c.showChallengePresentation(null, false, {name: '長い到着場所名称'.repeat(10)});
  assert.equal([...timers.values()][0].delay, 11000);
  c.showChallengePresentation({name: '次のチャレンジ'});
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 2800);
  assert.equal(elements['challenge-presentation-place'].hidden, true);
  assert.equal(elements['challenge-presentation-name'].hidden, false);
  assert(!classes.has('is-arrival'));
});
test('チャレンジ到着時は履歴一覧を開かず、メイン画面で達成演出を始める', () => {
  const challenge = {name: 'グルメ1km最寄り'}, target = {id: 'spot', name: 'トワサンク', lat: 1, lng: 1};
  const actions = [];
  const context = {appState: {activeChallenge: challenge}, arrivalInProgressId: null,
    document: {getElementById: () => ({value: ''})},
    recordArrivalAssociation() {}, saveAppData() {}, redrawMarkersWithFade() {}, hideOtherSettingToasts() {},
    stopSearchAndReset() {context.appState.activeChallenge = null;},
    checkMainInputClearState() {}, renderChallenges() {},
    navigateToMain() {actions.push('main');},
    openChallengeArrivals() {assert.fail('到達スポット一覧を自動で開いてはいけない');},
    showChallengePresentation(c, completed, arrival) {
      assert.equal(c, challenge); assert.equal(completed, true); assert.equal(arrival, target);
      actions.push('complete');
    }};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function updateArrivalRecordWithDetails'), source.indexOf('let mapRotationFrame')), context);
  context.updateArrivalRecordWithDetails({arrivals: []}, target, '2026-10-10');
  assert.deepEqual(actions, ['main', 'complete']);
});
