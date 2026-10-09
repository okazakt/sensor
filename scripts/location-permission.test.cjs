'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
function fixture(){
 const elements={};const watches=[],cleared=[],positions=[];
 const c={startupRefreshPending:false,window:{isSecureContext:true},navigator:{geolocation:{
  watchPosition(success,error,options){watches.push({success,error,options});return watches.length-1;},
  clearWatch(id){cleared.push(id);}
 }}, document:{getElementById:id=>elements[id] ||= {}},currentLang:'ja',
 watchId:null,locationAccessRequested:false,locationAccessState:'idle',locationWatchGeneration:0,lastLocationFixTime:0,
 appState:{currentPos:{lat:0,lng:0}},traceLocation(){},Date,
 onPositionUpdate:pos=>{positions.push(pos);c.appState.currentPos=pos.coords;},evaluateSensorCycle(){}};
 vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('function renderLocationAccess'),source.indexOf('function getDistance')),c);
 return {c,elements,watches,cleared,positions};
}
test('開始操作で初回の位置取得と監視を同時に開始し、成功後は案内を閉じる',()=>{
 const {c,elements,watches}=fixture();
 c.requestLocationAccess();
 assert.equal(c.locationAccessState,'waiting');assert.equal(c.appState.currentPos,null);
 assert.equal(watches.length,1);assert.equal(elements['location-access-notice'].hidden,false);
 watches[0].success({coords:{latitude:35,longitude:139}});
 assert.equal(c.locationAccessState,'ready');assert.equal(elements['location-access-notice'].hidden,true);
});
test('拒否された監視ID 0を解放し、設定変更後の再試行と継続位置更新を受け付ける',()=>{
 const {c,elements,watches,cleared,positions}=fixture();c.requestLocationAccess();
 watches[0].error({code:1,message:'User denied Geolocation'});
 assert.equal(c.watchId,null);assert.deepEqual(cleared,[0]);
 assert.equal(elements['location-access-retry'].hidden,false);
 assert.ok(elements['location-access-message'].textContent.includes('Safariのページメニュー'));
 c.requestLocationAccess();watches[1].success({coords:{latitude:35,longitude:139}});
 watches[1].success({coords:{latitude:35.001,longitude:139.001}});
 assert.equal(positions.length,2);assert.equal(c.locationAccessState,'ready');
 watches[0].error({code:1,message:'stale'});assert.equal(c.locationAccessState,'ready');
});
test('位置情報APIがない場合や安全でない接続では要求せず案内する',()=>{
 for(const insecure of [false,true]){
  const {c,watches}=fixture();
  if(insecure)c.window.isSecureContext=false;else c.navigator={};
  c.requestLocationAccess();assert.equal(watches.length,0);
  assert.equal(c.locationAccessState,insecure?'insecure':'unsupported');
 }
});
test('起動の同じクリック内で方向と位置の許可を要求し、非同期処理を待たない',async()=>{
 const handlers={},calls=[];
 const c={startupRefreshPending:false,document:{getElementById:id=>({addEventListener:(event,fn)=>handlers[id]=fn,classList:{remove(){}}})},
 requestCompassPermissionIfNeeded(){calls.push('compass');return new Promise(()=>{});},
 requestLocationAccess(){calls.push('location');},initAudio(){calls.push('audio');},
 appState:{wakeLockActive:true},requestWakeLock(){calls.push('wake');return new Promise(()=>{});}};
 vm.runInNewContext(source.slice(source.indexOf("document.getElementById('location-access-retry').addEventListener"),source.indexOf('setInterval(updateCompassStatus')),c);
 handlers['btn-safety-ok']();assert.deepEqual(calls,['compass','location','audio','wake']);
});
