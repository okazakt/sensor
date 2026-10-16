'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');

function fixture(challenge = null) {
  let resolveSave, rejectSave;
  const committed = new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
  const actions = [];
  const db = { arrivals:[] };
  const target = {id:'place', name:'Arrival', lat:35, lng:139};
  const c = {
    appState:{isTracking:true, isPaused:false, activeKeyword:'search', activeChallenge:challenge},
    arrivalInProgressId:null, searchGeneration:0, radarTimer:42, scheduledInterval:500,
    currentLang:'ja', traceArrivalStage: phase => actions.push(phase),
    clearTimeout(id) { assert.equal(id,42); actions.push('radar-stopped'); },
    loadSavedData:() => db,
    recordArrivalAssociation() {},
    saveAppData() { actions.push('save-requested'); return committed; },
    stopSearchAndReset() { actions.push('stop'); c.searchGeneration++; c.arrivalInProgressId = null; c.appState.isTracking = false; c.appState.activeChallenge = null; },
    redrawMarkersWithFade() { actions.push('markers'); }, hideOtherSettingToasts() {},
    checkMainInputClearState() {}, renderChallenges() {}, navigateToMain() {},
    showChallengePresentation(ch, done) { actions.push(ch && done ? 'challenge-fanfare' : 'banner'); },
    playTreasureFanfare() { actions.push('treasure-fanfare'); },
    updateButtonStateUI() {}, showToast() { actions.push('failure-notice'); },
    document:{getElementById() {return {value:'', classList:{remove(){}, add(){actions.push('flash');}}};}}
  };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('async function handleArrival('), source.indexOf('let mapRotationFrame')), c);
  return {c, actions, target, db, resolveSave, rejectSave};
}

test('保存待ち中は到着を重複させず、保存完了後に地図と演出を動かす', async () => {
  const {c, actions, target, db, resolveSave} = fixture();
  const first = c.handleArrival(target);
  await c.handleArrival(target);
  assert.equal(c.arrivalInProgressId, target.id);
  assert.equal(c.radarTimer,null);
  assert.equal(c.appState.isPaused,true);
  assert.equal(actions.filter(action => action === 'save-requested').length,1);
  assert.ok(!actions.includes('markers'));
  assert.ok(!actions.includes('flash'));
  assert.ok(!actions.includes('treasure-fanfare'));
  resolveSave(); await first;
  assert.equal(db.arrivals.length,1);
  assert.ok(actions.indexOf('saved') < actions.indexOf('stop'));
  assert.ok(actions.indexOf('stop') < actions.indexOf('markers'));
  assert.ok(actions.indexOf('saved') < actions.indexOf('treasure-fanfare'));
  assert.equal(c.arrivalInProgressId,null);
});

test('ランダムチャレンジ到着では完了音と通常到着音を重ねない', async () => {
  const {c, actions, target, resolveSave} = fixture({mode:'random'});
  const pending = c.handleArrival(target);
  resolveSave(); await pending;
  assert.equal(actions.filter(action => action === 'challenge-fanfare').length,1);
  assert.ok(!actions.includes('treasure-fanfare'));
  assert.ok(actions.indexOf('saved') < actions.indexOf('challenge-fanfare'));
});

test('保存失敗時は探索を一時停止し、到着完了の音や表示を出さない', async () => {
  const {c, actions, target, rejectSave} = fixture({mode:'random'});
  const pending = c.handleArrival(target);
  rejectSave(new Error('write failed')); await pending;
  assert.equal(c.appState.isPaused,true);
  assert.equal(c.arrivalInProgressId,null);
  assert.ok(actions.includes('failure-notice'));
  for (const action of ['markers','flash','treasure-fanfare','challenge-fanfare','complete']) assert.ok(!actions.includes(action));
});

test('保存待ち中に探索を終了したら古い到着が新しい画面に割り込まない', async () => {
  const {c, actions, target, resolveSave} = fixture();
  const pending = c.handleArrival(target);
  c.searchGeneration++;
  resolveSave(); await pending;
  assert.ok(actions.includes('saved'));
  assert.ok(actions.includes('cancelled'));
  assert.ok(!actions.includes('stop'));
  assert.ok(!actions.includes('flash'));
});

test('到着音のAPIが失敗しても保存済みの到着を失敗扱いにしない', async () => {
  const {c, actions, target, resolveSave} = fixture();
  c.playTreasureFanfare = () => { throw new Error('audio unavailable'); };
  const pending = c.handleArrival(target);
  resolveSave(); await pending;
  assert.ok(actions.includes('saved'));
  assert.ok(actions.includes('feedback-error'));
  assert.ok(actions.includes('complete'));
  assert.ok(!actions.includes('failure-notice'));
});

test('再起動調査用の記録は12段階までで、保存領域が使えなくても到着を妨げない', () => {
  let stored;
  const c = {BASE_JS_VERSION:'test-version', traceLocation(){},
    sessionStorage:{getItem:() => stored || null, setItem(key, value) {stored = value;}}};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function traceArrivalStage('),
    source.indexOf('// Enable only when diagnosing compass')), c);
  for (let i = 0; i < 20; i++) c.traceArrivalStage('saving');
  const entries = JSON.parse(stored);
  assert.equal(entries.length,12);
  assert.deepEqual(Object.keys(entries[0]).sort(), ['phase','time','version']);
  c.sessionStorage.getItem = () => {throw new Error('unavailable');};
  assert.doesNotThrow(() => c.traceArrivalStage('saved'));
});
