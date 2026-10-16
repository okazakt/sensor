'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname,'../runtime-diagnostics.js'),'utf8');
const KEY = 'sheikah_runtime_diagnostics_v1';
function fixture(storage = {}) {
  let now = 1000, writes = 0, copied, prompted;
  const listeners = {}, controls = {}, attributes = {}, timers = [];
  const document = {visibilityState:'visible',
    addEventListener(name, fn) {listeners[name] = fn;},
    querySelectorAll:() => [{setAttribute:(key,value) => attributes[key]=value,
      addEventListener:(name,fn) => controls[name]=fn}]};
  const window = {document, navigator:{userAgent:'test',standalone:true,clipboard:{async writeText(text){copied=text;}}},
    localStorage:{getItem:key => storage[key] || null, setItem(key,value){storage[key]=value;writes++;}},
    performance:{getEntriesByType:() => [{type:'reload'}]},
    setInterval:(fn,ms) => timers.push({fn,ms}), addEventListener(name,fn){listeners[name]=fn;},
    alert(){}, prompt(label,text){prompted=text;}};
  vm.runInNewContext(source,{window, Date:class extends Date {static now(){return now;}}});
  return {api:window.SensorRuntimeDiagnostics,window,listeners,controls,attributes,timers,storage,
    tick(ms){now+=ms;timers[0].fn();}, writes:() => writes, copied:() => copied, prompted:() => prompted};
}
test('高頻度のカウンター更新は10秒ごとに保存し、未知の項目や位置情報を含めない', () => {
  const f = fixture();
  f.api.setVersion('v-test');
  f.api.setSnapshotProvider(() => ({tracking:true, soundMode:'muted', lat:35, lng:139, places:['private'], apiKey:'secret'}));
  const before = f.writes();
  for (let i=0;i<10000;i++) {f.api.count('map.center'); f.api.count(`private-${i}`);}
  assert.equal(f.writes(),before);
  f.tick(10000);
  assert.equal(f.writes(),before+1);
  assert.equal(f.timers.length,1);
  assert.equal(f.timers[0].ms,10000);
  const data = JSON.parse(f.api.report());
  assert.equal(data.current.counters['map.center'],10000);
  assert.equal(Object.keys(data.current.counters).length,2);
  assert.deepEqual(data.current.sample,{tracking:true,soundMode:'muted'});
  assert.equal(data.current.uptimeSeconds,10);
  assert.ok(!f.api.report().includes('private'));
  assert.ok(f.storage[KEY].length<2000);
});
test('ページが突然終了しても前回の状態を次回起動で取り出せる', () => {
  const storage = {};
  const first = fixture(storage);
  first.api.setVersion('first');
  first.api.setSnapshotProvider(() => ({tracking:true}));
  first.api.event('map.context-lost');
  const second = fixture(storage);
  const previous = JSON.parse(second.api.report()).previous;
  assert.equal(previous.version,'first');
  assert.equal(previous.lifecycle,'running');
  assert.equal(previous.lastEvent,'map.context-lost');
  assert.equal(previous.sample.tracking,true);
  second.api.plannedReload('startup-update');
  second.listeners.pagehide();
  const third = fixture(storage);
  assert.equal(JSON.parse(third.api.report()).previous.version,'first');
});
test('正常な画面離脱・非表示とエラー種別を記録し、エラー本文は保存しない', () => {
  const f = fixture();
  f.window.document.visibilityState='hidden';
  f.listeners.visibilitychange();
  const writes = f.writes();
  f.tick(10000);
  assert.equal(f.writes(),writes);
  f.listeners.error({message:'private location'});
  f.listeners.unhandledrejection({reason:'secret URL'});
  f.listeners.pagehide();
  const data=JSON.parse(f.api.report());
  assert.equal(data.current.lifecycle,'pagehide');
  assert.equal(data.current.counters['js-error'],1);
  assert.equal(data.current.counters['promise-error'],1);
  assert.ok(!f.api.report().includes('private'));
  assert.ok(!f.api.report().includes('secret'));
});
test('保存領域が使えなくても動作し、バージョンから診断情報をコピーできる', async () => {
  const f = fixture();
  f.window.localStorage.setItem=() => {throw new Error('quota');};
  assert.doesNotThrow(() => f.api.event('map.context-lost'));
  assert.equal(f.attributes.role,'button');
  await f.controls.click();
  assert.equal(JSON.parse(f.copied()).current.lastEvent,'map.context-lost');
  f.window.navigator.clipboard.writeText=async () => {throw new Error('denied');};
  await f.controls.click();
  assert.equal(JSON.parse(f.prompted()).current.lastEvent,'map.context-lost');
});
