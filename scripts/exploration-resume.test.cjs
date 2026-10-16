'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../exploration-resume.js'),'utf8');
function fixture() {
  let saved=null,writes=0,errors=0,blocked=false,completed=[],active=true;
  const snapshot={schema:1,id:'session',startedAt:1,keyword:'公園',radius:1000,targetMode:'random',
    sensorDetail:'detailed',phase:'ready',paused:false,challengeId:'deep',
    challengeSettings:{targetMode:'nearest',sensorDetail:'standard',radiusIndex:2},
    places:[{id:'target',name:'Park',lat:35,lng:139,geometry:{type:'Polygon',coordinates:[]}}],
    searchOrigin:{lat:34.999,lng:139},randomTargetOrigin:{lat:34.999,lng:139},randomTargetId:'target',
    detailsResolvedIds:['target']};
  const window={};vm.runInNewContext(source,{window});
  const access={loadExploration:()=>saved,saveExploration:value=>{
    if(JSON.stringify(value)!==JSON.stringify(saved)) writes++;
    saved=JSON.parse(JSON.stringify(value));return true;}};
  const manager=window.SensorExplorationResume.create({access,capture:()=>active?snapshot:null,blocked:()=>blocked,
    completed:()=>completed,validateGeometry:value=>value.type==='Polygon',validateChallenge:id=>id==='deep',onError:()=>errors++});
  return {manager,snapshot,access,get saved(){return saved;},get writes(){return writes;},get errors(){return errors;},
    set active(value){active=value;},set blocked(value){blocked=value;},set completed(value){completed=value;}};
}
test('ターゲット・地形・完了済み詳細・チャレンジ条件を独立したコピーで復元する',()=>{
 const f=fixture();f.manager.checkpoint();const recovered=f.manager.load();
 assert.equal(recovered.randomTargetId,'target');assert.equal(recovered.detailsResolvedIds[0],'target');
 assert.equal(recovered.challengeSettings.radiusIndex,2);assert.equal(recovered.searchOrigin.lat,34.999);
 recovered.places[0].name='changed';assert.equal(f.manager.load().places[0].name,'Park');
 for(let i=0;i<100;i++)f.manager.checkpoint();assert.equal(f.writes,1);
});
test('ポイント更新中には保存せず、非探索中のチェックで復元候補を消さない',()=>{
 const f=fixture();f.blocked=true;f.manager.checkpoint();assert.equal(f.saved,null);
 f.blocked=false;f.manager.checkpoint();f.active=false;
 f.manager.checkpoint();assert.equal(f.writes,1);assert.equal(f.saved.id,"session");
 f.manager.clear();assert.equal(f.saved,null);
});
test('到着と同じ保存に含まれた完了IDは、古い復元候補を無効にする',()=>{
 const f=fixture();f.manager.checkpoint();f.completed=['session'];
 assert.equal(f.manager.load(),null);assert.equal(f.saved,null);
});
test('破損データ・欠けたターゲット・大きすぎる地形を復元しない',()=>{
 for(const mutate of [s=>s.radius=3,s=>s.randomTargetId='absent',s=>s.places[0].lat=91,
   s=>s.challengeId='unknown',s=>s.places[0].geometry.coordinates=['x'.repeat(500001)]]){
  const f=fixture();mutate(f.snapshot);f.manager.checkpoint();assert.equal(f.saved,null);assert.equal(f.errors,1);
 }
});
test('容量不足の警告を重複して表示しない',()=>{
 const f=fixture();f.manager.checkpoint();
 f.access.saveExploration=value=>value===null;
 f.manager.checkpoint();assert.equal(f.errors,1);
 f.manager.onError();assert.equal(f.errors,1);
});
