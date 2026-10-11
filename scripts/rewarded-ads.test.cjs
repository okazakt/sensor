'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../rewarded-ads.js'),'utf8');
function fixture(watchAd = async () => true, storage) {
  const values = new Map();
  storage ||= {getItem:key=>values.get(key) || null,setItem:(key,value)=>values.set(key,value)};
  const context = {window:{}};
  vm.runInNewContext(source,context);
  return {storage,controller:context.window.SensorRewardAds.createAccessController({storage,watchAd})};
}
test('初回視聴で1.0付与し、通常5回の後に次の検索前で再視聴する',async()=>{
  const reasons=[];
  const {controller:c}=fixture(async reason=>{reasons.push(reason);return true;});
  assert.equal(await c.startup(),true);
  assert.equal(c.snapshot().points,1);
  for(let i=0;i<5;i++) assert.equal(await c.search('normal',()=>true),true);
  assert.equal(c.snapshot().points,0);
  assert.deepEqual(reasons,['initial']);
  let executions=0;
  assert.equal(await c.search('normal',()=>{executions++;return true;}),false);
  assert.deepEqual(reasons,['initial','continue']);
  assert.equal(executions,0);
  assert.equal(c.snapshot().points,1);
  assert.equal(await c.search('normal',()=>{executions++;return true;}),true);
  assert.equal(executions,1);
  assert.equal(c.snapshot().points,0.8);
});
test('シークレット2回で0となり、混合時の負残高に1.0を加算する',async()=>{
  const {controller:c}=fixture();
  await c.startup();
  await c.search('secret',()=>true);
  await c.search('secret',()=>true);
  assert.equal(c.snapshot().points,0);
  assert.equal(await c.search('secret',()=>{assert.fail('視聴直後にチャレンジを開始しない');}),false);
  assert.equal(c.snapshot().points,1);
  for(let i=0;i<3;i++) await c.search('normal',()=>true);
  await c.search('secret',()=>true);
  assert.equal(c.snapshot().points,-0.1);
  assert.equal(await c.search('normal',()=>{assert.fail('視聴直後にSETを実行しない');}),false);
  assert.equal(c.snapshot().points,0.9);
  await c.search('normal',()=>true);
  assert.equal(c.snapshot().points,0.7);
});
test('キャンセル・視聴失敗・実行しなかった検索はポイントを増減しない',async()=>{
  const {controller:c}=fixture(async()=>false);
  let executions=0;
  assert.equal(await c.startup(),false);
  assert.equal(await c.search('normal',()=>{executions++;}),false);
  assert.equal(executions,0);
  assert.equal(c.snapshot().points,0);
  const {controller:d}=fixture();
  await d.startup();
  assert.equal(await d.search('normal',()=>false),false);
  assert.equal(d.snapshot().points,1);
});
test('残高を再起動後も保持し、初回広告を繰り返さない',async()=>{
  const {controller:c,storage}=fixture();
  await c.startup();await c.search('secret',()=>true);
  let ads=0;
  const {controller:d}=fixture(async()=>{ads++;return true;},storage);
  await d.startup();
  assert.equal(ads,0);
  assert.equal(d.snapshot().points,0.5);
});
test('連打中は追加の広告・検索・消費を発生させない',async()=>{
  let complete;
  let executions=0;
  const {controller:c}=fixture(()=>new Promise(resolve=>{complete=resolve;}));
  const first=c.search('normal',()=>{executions++;return true;});
  assert.equal(await c.search('secret',()=>{executions++;return true;}),false);
  complete(true);
  assert.equal(await first,false);
  assert.equal(executions,0);
  assert.equal(c.snapshot().points,1);
  assert.equal(await c.search('normal',()=>{executions++;return true;}),true);
  assert.equal(executions,1);
  assert.equal(c.snapshot().points,0.8);
});
test('保存不可でもセッション内で残高を維持する',async()=>{
  const {controller:c}=fixture(async()=>true,{getItem(){throw Error('blocked');},setItem(){throw Error('quota');}});
  await c.startup();await c.search('normal',()=>true);
  assert.equal(c.snapshot().points,0.8);
});
test('SDKはクリック内で呼び、completeだけで一度付与する。広告なし・途中終了は付与しない',async()=>{
  const elements=new Map();
  const storage=new Map();
  let options;
  let opens=0;
  const element=id=>{
    if(!elements.has(id)) elements.set(id,{
      open:false,hidden:true,handlers:{},
      addEventListener(type,fn){this.handlers[type]=fn;},
      showModal(){this.open=true;},close(){this.open=false;},replaceChildren(){}
    });
    return elements.get(id);
  };
  const context={document:{getElementById:element},setTimeout:()=>1,clearTimeout(){},window:{
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    APPLIXIR_CONFIG:{apiKey:'test-public-key'},
    initializeAndOpenPlayer(value){options=value;opens++;}
  }};
  vm.runInNewContext(source,context);
  const ads=context.window.SensorRewardAds;
  const startup=ads.startup();
  await Promise.resolve();
  assert.equal(opens,0);
  ads.language=()=> 'en';
  ads.refreshLanguage();
  assert.equal(element('rewarded-access-title').textContent,'Watch a video to start');
  assert.equal(element('rewarded-access-lang-label').textContent,'→JA');
  assert.equal(element('rewarded-access-watch').disabled,false);
  assert.equal(opens,0);
  ads.language=()=> 'ja';
  ads.refreshLanguage();
  assert.equal(element('rewarded-access-dialog').open,true);
  element('rewarded-access-watch').handlers.click();
  assert.equal(opens,1);
  assert.equal(options.injectionElementId,'applixir-ad-container');
  options.adStatusCallbackFn({type:'firstQuartile'});
  assert.equal(ads.snapshot().points,0);
  options.adStatusCallbackFn({type:'allAdsCompleted'});
  await Promise.resolve();
  ads.language=()=> 'en';
  ads.refreshLanguage();
  assert.match(element('rewarded-access-status').textContent,/not completed/);
  assert.equal(opens,1);
  assert.equal(element('rewarded-access-watch').disabled,false);
  ads.language=()=> 'ja';
  ads.refreshLanguage();
  assert.match(element('rewarded-access-status').textContent,/完了していません/);
  assert.equal(element('rewarded-access-dialog').open,true);
  assert.equal(ads.snapshot().points,0);
  element('rewarded-access-watch').handlers.click();
  const stale=options;
  options.adStatusCallbackFn({type:'complete'});
  options.adStatusCallbackFn({type:'complete'});
  assert.equal(await startup,true);
  assert.equal(ads.snapshot().points,1);
  for(let i=0;i<5;i++) await ads.search('normal',()=>true);
  const sixth=ads.search('normal',()=>true);
  await Promise.resolve();
  element('rewarded-access-watch').handlers.click();
  stale.adStatusCallbackFn({type:'complete'});
  assert.equal(ads.snapshot().points,0);
  options.adStatusCallbackFn({type:'skipped'});
  assert.equal(ads.snapshot().points,0);
  element('rewarded-access-cancel').handlers.click();
  assert.equal(await sixth,false);
  assert.equal(ads.snapshot().points,0);
});
