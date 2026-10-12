'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const refreshSource=source.slice(source.indexOf('const CACHE_CHECK_KEY'),source.indexOf("document.addEventListener('visibilitychange'"));
function fixture({standalone=true,session={},timestamp=Date.now()-2*24*60*60*1000,blocked=false}={}){
 const elements={};const reloads=[],deleted=[],timers=new Map();let release,timerId=0;
 const storage={sheikah_last_cache_time:String(timestamp)};
 const localStorage={getItem:key=>storage[key]||null,setItem:(key,value)=>storage[key]=value};
 const sessionStorage={getItem:key=>session[key]||null,setItem:(key,value)=>session[key]=value};
 const caches={keys:()=>blocked?new Promise(resolve=>{release=resolve;}):Promise.resolve(['old']),delete:name=>{deleted.push(name);return Promise.resolve(true);}};
 const c={isStandaloneMode:standalone,Date,Promise,localStorage,sessionStorage,caches,
 appState:{isTracking:false,activeChallenge:null},isSearchInProgress:false,arrivalInProgressId:null,
 rewardedSearchPending:false,challengeStartPending:false,compassPermissionPending:false,locationAccessState:'ready',
 setTimeout:(fn)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
 window:{caches,location:{reload:()=>reloads.push('reload')}},traceLocation(){},
 document:{visibilityState:'visible',getElementById:id=>elements[id]||=( {classList:{add(){},remove(){},contains(){return false;}}})}};
 vm.createContext(c);vm.runInContext(refreshSource,c);
 return {c,elements,reloads,deleted,session,storage,timers,
 next:()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();},release:()=>release(['old'])};
}
test('初回起動と24時間更新が重なってもリロードは一度だけ行う',async()=>{
 const f=fixture();await new Promise(setImmediate);
 assert.equal(f.reloads.length,1);assert.deepEqual(f.deleted,['old']);
 assert.equal(f.session.sheikah_pwa_refreshed,'true');
 assert.equal(f.elements['btn-safety-ok'].disabled,true);
});
function attachResume(f) {
 let handler, cycles=0, clock=Date.now();
 f.c.Date={now:()=>clock};
 Object.assign(f.c,{radarTimer:null,scheduledInterval:null,locationAccessRequested:false,
  watchId:null,evaluateSensorCycle(){cycles++;}});
 f.c.document.addEventListener=(event,fn)=>{handler=fn;};
 vm.runInContext(source.slice(source.indexOf("document.addEventListener('visibilitychange'"),source.indexOf('const I18N =')),f.c);
 return {resume(minutes){
  f.c.document.visibilityState='hidden';handler();
  clock+=minutes*60*1000;
  f.c.document.visibilityState='visible';handler();
 },visible(){handler();},cycles:()=>cycles};
}
test('24時間経過しても起動時や短い離脱では更新せず、10分以上離れた復帰時だけ更新する',async()=>{
 const f=fixture({standalone:false});const r=attachResume(f);
 await new Promise(setImmediate);assert.equal(f.reloads.length,0);
 r.visible();r.resume(9.99);await new Promise(setImmediate);
 assert.equal(f.reloads.length,0);
 r.resume(10);await new Promise(setImmediate);
 assert.equal(f.reloads.length,1);assert.deepEqual(f.deleted,['old']);
});
test('更新期限前は長い離脱から復帰してもリロードしない',async()=>{
 const f=fixture({standalone:false,timestamp:Date.now()});const r=attachResume(f);
 r.resume(10);await new Promise(setImmediate);assert.equal(f.reloads.length,0);
});
test('探索・一時停止・チャレンジ中の復帰は更新を保留し、終了後も次の長い離脱まで待つ',async()=>{
 for(const state of [{isTracking:true},{isTracking:true,isPaused:true},{activeChallenge:{id:'challenge'}}]){
  const f=fixture({standalone:false});const r=attachResume(f);
  Object.assign(f.c.appState,state);const oldTime=f.storage.sheikah_last_cache_time;
  r.resume(10);await new Promise(setImmediate);
  assert.equal(f.reloads.length,0);assert.deepEqual(f.deleted,[]);
  assert.equal(f.storage.sheikah_last_cache_time,oldTime);
  assert.equal(f.elements['btn-safety-ok'],undefined);assert.equal(f.timers.size,0);
  if(state.isTracking&&!state.isPaused)assert.equal(r.cycles(),1);
  f.c.appState.isTracking=false;f.c.appState.activeChallenge=null;
  let visible=true;
  f.c.document.getElementById('challenge-presentation').classList.contains=()=>visible;
  r.resume(10);await new Promise(setImmediate);assert.equal(f.reloads.length,0);
  visible=false;r.visible();await new Promise(setImmediate);assert.equal(f.reloads.length,0);
  r.resume(10);await new Promise(setImmediate);assert.equal(f.reloads.length,1);
 }
});
test('動画再生・許可待ち・検索処理中の復帰は更新せず、次の安全な復帰で実施する',async()=>{
 for(const blocker of ['rewardedSearchPending','challengeStartPending','compassPermissionPending','isSearchInProgress','arrivalInProgressId','locationAccessState']){
  const f=fixture({standalone:false});const r=attachResume(f);
  f.c[blocker]=blocker==='locationAccessState'?'waiting':blocker==='arrivalInProgressId'?'spot':true;
  r.resume(10);await new Promise(setImmediate);assert.equal(f.reloads.length,0);
  f.c[blocker]=blocker==='locationAccessState'?'ready':blocker==='arrivalInProgressId'?null:false;
  assert.equal(f.timers.size,0);
  r.resume(10);await new Promise(setImmediate);assert.equal(f.reloads.length,1);
 }
});
test('キャッシュ削除中は開始ボタンを無効にし、位置と方向の許可を要求しない',async()=>{
 const f=fixture({blocked:true});let calls=0;
 Object.assign(f.c,{traceLocation(){calls++;},compassPermissionPending:false,compassActive:false,locationAccessRequested:false});
 vm.runInContext(source.slice(source.indexOf('async function requestCompassPermissionIfNeeded'),source.indexOf('function updateCompassStatus')),f.c);
 vm.runInContext(source.slice(source.indexOf('function requestLocationAccess'),source.indexOf('function getDistance')),f.c);
 await f.c.requestCompassPermissionIfNeeded();f.c.requestLocationAccess();
 assert.equal(calls,0);assert.equal(f.reloads.length,0);assert.equal(f.elements['btn-safety-ok'].disabled,true);
 f.release();await new Promise(setImmediate);assert.equal(f.reloads.length,1);
});
test('更新済みの次のページはリロードせず、開始画面を有効にする',async()=>{
 const f=fixture({session:{sheikah_pwa_refreshed:'true'},timestamp:Date.now()});
 vm.runInContext(source.slice(source.indexOf('function checkAndShowStartupModals'),source.indexOf("document.getElementById('btn-pwa-skip').addEventListener")),f.c);
 f.c.checkAndShowStartupModals();await new Promise(setImmediate);
 assert.equal(f.reloads.length,0);assert.equal(f.elements['btn-safety-ok'].disabled,false);
});
