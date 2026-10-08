'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../script.js'),'utf8');
function fixture(){
 const c={}; vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('const CHALLENGE_GROUPS'),source.indexOf('const RADIUS_OPTIONS')),c);
 vm.runInContext(source.slice(source.indexOf('function normalizeHistoryData'),source.indexOf('function saveAppData')),c);
 return c;
}
test('旧チャレンジ履歴を手動履歴から分離し、繰り返し読み込みでも関連を維持する',()=>{
 const c=fixture();const db={keywordHistory:{'グルメ1km最寄り':{},cafe:{}},arrivals:[
 {id:'challenge',keyword:'グルメ1km最寄り'}, {id:'manual',keyword:'cafe',challengeIds:['random1-life']}]};
 c.normalizeHistoryData(db);c.normalizeHistoryData(db);
 assert.deepEqual(Object.keys(db.keywordHistory),['cafe']);
 assert.equal(db.arrivals[0].keywords.length,0);
 assert.equal(db.arrivals[0].challengeIds[0],'nearest1-gourmet');
 assert.equal(db.arrivals[1].keywords[0],'cafe');
 assert.equal(db.arrivals[1].challengeIds[0],'random1-life');
});
test('同じ到達地を複数キーワードとチャレンジに関連付け、削除は該当する関連のみ外す',()=>{
 const c=fixture();const db={keywordHistory:{},arrivals:[{id:'shared',keyword:'',keywords:[]},{id:'only',keyword:'cafe',keywords:['cafe']}]};
 const item=db.arrivals[0];
 c.recordArrivalAssociation(db,item,'cafe',null,'2026-10-08');
 c.recordArrivalAssociation(db,item,'restaurant',null,'2026-10-08');
 c.recordArrivalAssociation(db,item,'グルメ1km最寄り',{id:'nearest1-gourmet'},'2026-10-08');
 assert.equal(Object.keys(db.keywordHistory).length,2);
 assert.equal(db.arrivals.length,2);
 c.deleteKeywordHistory(db,'cafe');
 assert.equal(db.arrivals.length,1);
 assert.equal(item.keywords[0],'restaurant');
 assert.ok(!db.keywordHistory.cafe);
 c.deleteKeywordHistory(db,'restaurant');
 assert.equal(db.arrivals.length,1);
 assert.equal(item.keywords.length,0);
 assert.equal(item.challengeIds[0],'nearest1-gourmet');
 assert.equal(db.completedChallenges[0],'nearest1-gourmet');
});
