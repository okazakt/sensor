'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
function fixture(fetchGeoapify) {
  const c = { fetchGeoapify, currentLang: 'ja', appState: { isTracking: false },
    getDistance: () => 1000, evaluateSensorCycle() {} };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function validDestinationGeometry'), source.indexOf('function getSearchCandidates')), c);
  return c;
}
const ring = size => [[-size,-size],[size,-size],[size,size],[-size,size],[-size,-size]];
const target = { id:'place-id', lat:1, lng:1, geometry: {type:'Polygon', coordinates:[ring(0.01)]} };
test('広い敷地内、境界上、境界から20m以内と外側を区別する', () => {
  const c = fixture();
  assert.equal(c.destinationDistance({lat:0,lng:0},target),0);
  assert.equal(c.destinationDistance({lat:0,lng:0.01},target),0);
  assert.ok(c.destinationDistance({lat:0,lng:0.0101},target) < 20);
  assert.ok(c.destinationDistance({lat:0,lng:0.0103},target) > 20);
});
test('穴は敷地外として扱い、複数の敷地と欠損データにも対応する', () => {
  const c = fixture();
  const hole = {...target, geometry:{type:'Polygon',coordinates:[ring(0.01),ring(0.001)]}};
  assert.ok(c.destinationDistance({lat:0,lng:0},hole) > 20);
  assert.equal(c.destinationDistance({lat:0,lng:0.005},hole),0);
  const multi = {...target, geometry:{type:'MultiPolygon',coordinates:[[ring(0.01)], [ring(0.02)]]}};
  assert.equal(c.destinationDistance({lat:0,lng:0.015},multi),0);
  for (const geometry of [null, {type:'Point',coordinates:[0,0]}, {type:'Polygon',coordinates:[]}, {type:'Polygon',coordinates:[[[NaN,0]]] }]) {
    assert.equal(c.destinationDistance({lat:0,lng:0},{...target,geometry}),1000);
  }
});
test('詳細取得を重複せず、目的地自身の境界だけを採用する', async () => {
  let calls = 0;
  const c = fixture(async (path, params) => {
    calls++;
    assert.equal(path,'/v2/place-details');
    assert.equal(params.id,'place-id');
    return [{properties:{feature_type:'building'},geometry:{type:'Polygon',coordinates:[ring(1)]}},
      {properties:{feature_type:'details'},geometry:target.geometry}];
  });
  const a = {...target,geometry:null}, b = {...a};
  c.requestDestinationGeometry(a); c.requestDestinationGeometry(b);
  await new Promise(setImmediate);
  assert.equal(calls,1);
  assert.equal(a.geometry,target.geometry);
  assert.equal(b.geometry,target.geometry);
  const d = {...a,geometry:null}; c.requestDestinationGeometry(d);
  assert.equal(d.geometry,target.geometry);
  assert.equal(calls,1);
});
test('API失敗・点の詳細は従来の判定を保持する', async () => {
  for (const fetch of [async () => {throw new Error('offline');}, async () => [{properties:{feature_type:'details'},geometry:{type:'Point',coordinates:[0,0]}}]]) {
    const c = fixture(fetch), a = {...target,geometry:null};
    c.requestDestinationGeometry(a);
    await new Promise(setImmediate);
    assert.equal(c.destinationDistance({lat:0,lng:0},a),1000);
  }
});


test('到着地点に最も近い輪郭上の点を求め、内部でも輪郭にピンを置く', () => {
  const c = fixture();
  const outside = c.destinationGeometryReading({lat:0.003,lng:0.0101},target);
  assert.ok(Math.abs(outside.boundary.lng - 0.01) < 1e-10);
  assert.ok(Math.abs(outside.boundary.lat - 0.003) < 1e-10);
  const inside = c.destinationGeometryReading({lat:0.003,lng:0.009},target);
  assert.equal(inside.distance,0);
  assert.ok(Math.abs(inside.boundary.lng - 0.01) < 1e-10);
  assert.ok(Math.abs(inside.boundary.lat - 0.003) < 1e-10);
});

test('到着位置と輪郭を永続記録し、探索用代表座標を維持する', () => {
  const c = fixture();
  Object.assign(c, { arrivalInProgressId:null, toastBannerTimer:null,
    showChallengePresentation: (challenge, completed, arrival) => {
      assert.equal(challenge, null);
      assert.equal(completed, false);
      assert.equal(arrival, target);
    },
    document:{getElementById: () => ({classList:{add(){},remove(){}}})},
    recordArrivalAssociation(){}, saveAppData(db){ c.saved = JSON.parse(JSON.stringify(db)); },
    redrawMarkersWithFade(){}, hideOtherSettingToasts(){}, setTimeout(){}, stopSearchAndReset(){} });
  c.appState.currentPos = {lat:0.003,lng:0.0101};
  vm.runInContext(source.slice(source.indexOf('function updateArrivalRecordWithDetails'),source.indexOf('let mapRotationFrame')),c);
  const db = {arrivals:[]};
  c.updateArrivalRecordWithDetails(db,target,'2026-10-09');
  const record = c.saved.arrivals[0];
  assert.equal(record.lat,target.lat);
  assert.equal(record.lng,target.lng);
  assert.ok(Math.abs(record.arrivalPosition.lng - 0.01) < 1e-10);
  assert.equal(JSON.stringify(record.geometry),JSON.stringify(target.geometry));
  c.appState.currentPos = {lat:0.01,lng:0.002};
  c.updateArrivalRecordWithDetails(db,target,'2026-10-10');
  assert.equal(db.arrivals.length,1);
  assert.ok(Math.abs(c.saved.arrivals[0].arrivalPosition.lng - 0.002) < 1e-10);
});

test('図鑑・到着ピンは保存した輪郭位置を使用し、旧履歴は代表座標に戻る', () => {
  const c = fixture();
  vm.runInContext(source.slice(source.indexOf('function arrivalPinPosition'),source.indexOf('function updateDestinationOutlines')),c);
  const item = {...target,arrivalPosition:{lat:0.003,lng:0.01}};
  assert.equal(c.arrivalPinPosition(item),item.arrivalPosition);
  assert.equal(c.arrivalPinPosition(target),target);
  assert.equal(c.arrivalPinPosition({...target,arrivalPosition:{lat:NaN,lng:0}}).id,target.id);
});

test('支店名を結合し、既に含まれる場合は重複せず、欠損時は既存の店名を保持する', () => {
  const c = fixture();
  assert.equal(c.geoapifyPlaceIdentity({name:'マクドナルド',branch:'八王子店'}).name,'マクドナルド 八王子店');
  assert.equal(c.geoapifyPlaceIdentity({name:'マクドナルド 八王子店',branch:'八王子店'}).name,'マクドナルド 八王子店');
  assert.equal(c.geoapifyPlaceIdentity({name:'マクドナルド'},'マクドナルド 八王子店').name,'マクドナルド 八王子店');
  assert.equal(c.geoapifyPlaceIdentity({name:'マクドナルド',datasource:{raw:{branch:'八王子店'}}}).branch,'八王子店');
  assert.equal(c.geoapifyPlaceIdentity({name:'McDonald’s',name_international:{ja:'マクドナルド'},branch:'八王子店'}).name,'マクドナルド 八王子店');
});
test('旧図鑑の支店名を更新し、到達日・関連・座標を保持して同じIDで保存する', async () => {
  const c = fixture(async () => [{properties:{feature_type:'details',name:'マクドナルド',branch:'八王子店',brand:'マクドナルド'}}]);
  const item = {id:'place-id',name:'マクドナルド',date:'2026-10-09',keywords:['カフェ'],challengeIds:['challenge'],lat:1,lng:2};
  let saved = JSON.parse(JSON.stringify(item));
  c.loadSavedData = () => ({arrivals:[JSON.parse(JSON.stringify(saved))]});
  c.saveAppData = db => {saved = JSON.parse(JSON.stringify(db.arrivals[0]));};
  c.requestDestinationGeometry(item);
  await new Promise(setImmediate);
  assert.equal(item.name,'マクドナルド 八王子店');
  assert.equal(saved.name,item.name);
  assert.equal(saved.branch,'八王子店');
  assert.equal(saved.date,'2026-10-09');
  assert.deepEqual(saved.keywords,['カフェ']);
  assert.deepEqual(saved.challengeIds,['challenge']);
  assert.equal(saved.lat,1);
  assert.equal(saved.lng,2);
});

test('店舗詳細の更新を各一覧にも反映し、別の店舗の表示は維持する', () => {
  const c = fixture();
  const item = {id:'place-id',name:'マクドナルド'};
  const titles = [{textContent:'マクドナルド'}, {textContent:'マクドナルド'}, {textContent:'バーミヤン'}];
  const rows = titles.map((title,i)=>({dataset:{spotId:i===2?'another-id':item.id},querySelector:()=>title}));
  c.document = {querySelectorAll:()=>rows,getElementById:()=>({})};
  c.applyDestinationDetails(item,{name:'マクドナルド',branch:'八王子店'});
  assert.equal(titles[0].textContent,'マクドナルド 八王子店');
  assert.equal(titles[1].textContent,'マクドナルド 八王子店');
  assert.equal(titles[2].textContent,'バーミヤン');
});
