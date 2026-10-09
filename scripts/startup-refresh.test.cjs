'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const refreshSource=source.slice(source.indexOf('const CACHE_CHECK_KEY'),source.indexOf("document.addEventListener('visibilitychange'"));
function fixture({standalone=true,session={},timestamp=Date.now()-2*24*60*60*1000,blocked=false}={}){
 const elements={};const reloads=[],deleted=[];let release;
 const storage={sheikah_last_cache_time:String(timestamp)};
 const localStorage={getItem:key=>storage[key]||null,setItem:(key,value)=>storage[key]=value};
 const sessionStorage={getItem:key=>session[key]||null,setItem:(key,value)=>session[key]=value};
 const caches={keys:()=>blocked?new Promise(resolve=>{release=resolve;}):Promise.resolve(['old']),delete:name=>{deleted.push(name);return Promise.resolve(true);}};
 const c={isStandaloneMode:standalone,Date,Promise,localStorage,sessionStorage,caches,
 window:{caches,location:{reload:()=>reloads.push('reload')}},traceLocation(){},
 document:{getElementById:id=>elements[id]||=( {classList:{add(){},remove(){}}})}};
 vm.createContext(c);vm.runInContext(refreshSource,c);
 return {c,elements,reloads,deleted,session,release:()=>release(['old'])};
}
test('初回起動と24時間更新が重なってもリロードは一度だけ行う',async()=>{
 const f=fixture();await new Promise(setImmediate);
 assert.equal(f.reloads.length,1);assert.deepEqual(f.deleted,['old']);
 assert.equal(f.session.sheikah_pwa_refreshed,'true');
 assert.equal(f.elements['btn-safety-ok'].disabled,true);
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
