'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
function fixture() {
  const elements = new Map();
  function element() { return {textContent:'', innerHTML:'credits', hidden:false, setAttribute(){}, classList:{add(){}}, appendChild(){}}; }
  const items = [{id:'a', name:'A', date:'2026-10-09', keywords:['cafe','park'], challengeIds:['challenge']},
    {id:'b', name:'B', date:'2026-10-09', keywords:[]}, {id:'c', name:'C', date:'2026-10-09', keywords:[]}];
  const c = {appState:{}, currentLang:'ja', CHALLENGES:[{id:'challenge'}], challengeName:()=> 'チャレンジ名',
    I18N:{ja:{arrivalDate:()=> 'date'}}, loadSavedData:()=>({arrivals:items}), hideOtherSettingToasts(){},
    lastKnownPos:null, detailMinimapInstance:null, pageSpotDetail:element(), renderDetailMap(){},
    document:{getElementById(id){if(!elements.has(id)) elements.set(id,element());return elements.get(id);},
      querySelector:()=>element(), createElement:element}};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('let detailNavigationIds'), source.indexOf('function renderDetailMap')), c);
  return {c,items,elements};
}
test('一覧の順番で前後移動し、端では非活性で循環しない',()=>{
  const {c,items,elements} = fixture();
  c.openSpotDetailModal(items[2], [items[2],items[0],items[1]]);
  assert.equal(elements.get('detail-btn-previous').disabled,true);
  c.moveSpotDetail(-1);
  assert.equal(c.appState.selectedSpotForDetail.id,'c');
  c.moveSpotDetail(1);
  assert.equal(c.appState.selectedSpotForDetail.id,'a');
  assert.match(elements.get('detail-spot-keyword').textContent,/cafe \/ park/);
  assert.match(elements.get('detail-spot-challenges').textContent,/チャレンジ名/);
  assert.equal(elements.get('detail-spot-challenges').hidden,false);
  c.moveSpotDetail(1);
  assert.equal(c.appState.selectedSpotForDetail.id,'b');
  assert.equal(elements.get('detail-btn-next').disabled,true);
  assert.equal(elements.get('detail-spot-challenges').hidden,true);
  c.moveSpotDetail(1);
  assert.equal(c.appState.selectedSpotForDetail.id,'b');
});
test('絞り込み一覧に含まれる図鑑だけを移動する',()=>{
  const {c,items} = fixture();
  c.openSpotDetailModal(items[1], [items[1],items[0]]);
  c.moveSpotDetail(1);
  assert.equal(c.appState.selectedSpotForDetail.id,'a');
  c.moveSpotDetail(1);
  assert.equal(c.appState.selectedSpotForDetail.id,'a');
});
