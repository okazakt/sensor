'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source=fs.readFileSync(require.resolve('../script.js'),'utf8');
function fixture(){
 const notices=[],timers=[];
 let presenting=false;
 const c={appState:{initialDetectionNoticePending:true,isTracking:true,isPaused:false,currentPos:{lat:1,lng:2},explorationId:'one',sensorDetail:'standard'},
  currentLang:'ja',initialDetectionNoticeTimer:null,
  document:{getElementById:()=>({classList:{contains:()=>presenting}})},
  showConditionToast:(message,diagram)=>notices.push({message,diagram,mode:c.appState.sensorDetail}),
  setTimeout:fn=>{timers.push(fn);return timers.length;},evaluateSensorCycle:()=>c.maybeShowInitialDetection(1)};
 vm.runInNewContext(source.slice(source.indexOf('function maybeShowInitialDetection'),source.indexOf('function evaluateSensorCycle')),c);
 return {c,notices,timers,present:value=>{presenting=value;}};
}
test('最初の非ゼロ捕捉時にだけ、現在のセンサーの図と指定文を通知する',()=>{
 for(const mode of ['standard','detailed']){
  const f=fixture();f.c.appState.sensorDetail=mode;
  f.c.maybeShowInitialDetection(0);assert.equal(f.notices.length,0);
  f.c.maybeShowInitialDetection(3);f.c.maybeShowInitialDetection(4);
  assert.deepEqual(f.notices,[{message:'対象を探知しました。センサー反応を確認して到達を目指してください。',diagram:true,mode}]);
 }
});
test('一時停止・検索停止・GPS待ちでは通知せず、次の探索では再び通知する',()=>{
 for(const setup of [{isPaused:true},{isTracking:false},{currentPos:null}]){
  const f=fixture();Object.assign(f.c.appState,setup);f.c.maybeShowInitialDetection(1);
  assert.equal(f.notices.length,0);assert.equal(f.c.appState.initialDetectionNoticePending,true);
 }
 const f=fixture();f.c.maybeShowInitialDetection(1);
 f.c.appState.initialDetectionNoticePending=true;f.c.appState.explorationId='two';f.c.maybeShowInitialDetection(1);
 assert.equal(f.notices.length,2);
});
test('チャレンジ開始演出の終了を待ち、古い探索の遅延処理では通知しない',()=>{
 const f=fixture();f.present(true);f.c.maybeShowInitialDetection(1);f.c.maybeShowInitialDetection(1);
 assert.equal(f.notices.length,0);assert.equal(f.timers.length,1);
 f.present(false);f.timers[0]();assert.equal(f.notices.length,1);
 const g=fixture();g.present(true);g.c.maybeShowInitialDetection(1);
 g.c.appState.explorationId='new';g.present(false);g.timers[0]();assert.equal(g.notices.length,0);
});
test('英語モードは英語の案内を表示する',()=>{
 const f=fixture();f.c.currentLang='en';f.c.maybeShowInitialDetection(1);
 assert.equal(f.notices[0].message,'Target detected. Follow the sensor signals to reach your destination.');
});
