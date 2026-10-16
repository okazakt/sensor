'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const adsSource = fs.readFileSync(path.join(__dirname, '../rewarded-ads.js'), 'utf8');
function fixture({units=10, secret=false, watchAd=async()=>true}={}) {
  let saved=JSON.stringify({initialWatched:true,units});
  const window={};vm.runInNewContext(adsSource,{window});
  const ads=window.SensorRewardAds.createAccessController({
    storage:{getItem:()=>saved,setItem:(_key,value)=>{saved=value;}},watchAd});
  window.SensorRewardAds=ads;
  const calls=[];
  const c={window,appState:{isTracking:true,isPaused:false,currentPos:{lat:1,lng:2},
    activeKeyword:'カフェ',activeChallenge:secret?{group:'secret'}:null,places:[],randomTarget:null},
    initialSearchAccessGranted:false,searchGeneration:0,isSearchInProgress:false,
    RADIUS_OPTIONS:[1000],radiusIndex:0,currentLang:'ja',I18N:{ja:{targetMeta:()=>''}},
    document:{getElementById:()=>({textContent:''})},console:{warn(){}},
    evaluateSensorCycle(){},getSearchCandidates:()=>[],chooseSearchTarget(){},
    searchGeoapify:async()=>{calls.push('normal');return {places:[]};},
    searchSecretChallenge:async()=>{calls.push('secret');return {places:[]};},
    stopSearchAndReset(){calls.push('stop');c.searchGeneration++;c.appState.isTracking=false;
      c.appState.isPaused=false;c.appState.activeChallenge=null;}};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('async function executeSearch('),source.indexOf('function showConditionToast')),c);
  vm.runInContext(source.slice(source.indexOf('let rewardedSearchPending ='),source.indexOf('function startSearchFromSet')),c);
  return {c,ads,calls};
}
test('自動再探索は通常0.2・シークレット0.5を毎回消費する',async()=>{
  for(const secret of [false,true]){
    const f=fixture({secret});await f.c.executeSearch(true);
    assert.deepEqual(f.calls,[secret?'secret':'normal']);
    assert.equal(f.ads.snapshot().points,secret?0.5:0.8);
    await f.c.executeSearch(true);assert.equal(f.ads.snapshot().points,secret?0:0.6);
  }
});
test('不足時は一時停止して動画を案内し、辞退したら探索もチャレンジも終了する',async()=>{
  for(const secret of [false,true]){
    let release;
    const f=fixture({units:secret?4:1,secret,watchAd:()=>new Promise(r=>{release=r;})});
    const pending=f.c.executeSearch(true);
    assert.equal(f.c.appState.isPaused,true);
    await f.c.executeSearch(true);assert.deepEqual(f.calls,[]);
    release(false);await pending;
    assert.deepEqual(f.calls,['stop']);assert.equal(f.c.appState.isTracking,false);
    assert.equal(f.c.appState.activeChallenge,null);
    assert.equal(f.ads.snapshot().points,secret?0.4:0.1);
  }
});
test('動画完了後は現在位置で再探索を再開し、停止済みの探索には応答を適用しない',async()=>{
  let release;
  const f=fixture({units:0,watchAd:()=>new Promise(r=>{release=r;})});
  const pending=f.c.executeSearch(true);
  f.c.appState.currentPos={lat:3,lng:4};release(true);await pending;
  assert.equal(f.c.appState.isPaused,false);assert.equal(f.c.appState.lastSearchedPos.lat,3);
  assert.deepEqual(f.calls,['normal']);assert.equal(f.ads.snapshot().points,0.8);
  const g=fixture({units:0,watchAd:()=>new Promise(r=>{release=r;})});
  const stopped=g.c.executeSearch(true);g.c.stopSearchAndReset();release(true);await stopped;
  assert.deepEqual(g.calls,['stop']);assert.equal(g.ads.snapshot().points,1);
});
test('開始時の支払いはGPS取得待ちでも最初の検索一回に適用し、二重消費しない',async()=>{
  const f=fixture({units:8});f.c.initialSearchAccessGranted=true;f.c.appState.currentPos=null;
  await f.c.executeSearch();assert.equal(f.c.initialSearchAccessGranted,true);
  f.c.appState.currentPos={lat:1,lng:2};await f.c.executeSearch();
  assert.equal(f.ads.snapshot().points,0.8);assert.equal(f.c.initialSearchAccessGranted,false);
  await f.c.executeSearch(true);assert.equal(f.ads.snapshot().points,0.6);
});

test('新規開始はポイントと復元状態を確定してから最初のAPIを呼ぶ',async()=>{
 const f=fixture();const order=[];
 f.c.SensorExplorationRecovery={checkpoint(){},capture(){order.push('snapshot');return {id:'paid',phase:'waiting'};}};
 f.c.searchGeoapify=async()=>{
  order.push('api');assert.equal(f.ads.snapshot().units,8);assert.equal(f.ads.loadExploration().id,'paid');
  return {places:[]};
 };
 await f.c.runRewardedSearch('normal',()=>{
  f.c.initialSearchAccessGranted=true;
  f.c.executeSearch(); // The normal begin callback must defer this call until commit.
  assert.deepEqual(order,[]);
  return true;
 });
 assert.deepEqual(order,['snapshot','api']);assert.equal(f.c.appState.accessCommitPending,false);
});
