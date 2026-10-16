'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
function fixture(fetch) {
  const c = { URL, AbortController, fetch, setTimeout, clearTimeout,
    window: {SENSOR_CONFIG: {geoapifyApiKey: 'test-only-placeholder'}},
    getDistance: (_a, _b, lat) => Math.abs(lat) * 1000 };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('const CHALLENGE_GROUPS'), source.indexOf('const RADIUS_OPTIONS')), c);
  c.currentLang = 'ja';
  vm.runInContext(source.slice(source.indexOf('function validDestinationGeometry'), source.indexOf('function geoapifyPlaceIdentity')), c);
  vm.runInContext(source.slice(source.indexOf('function geoapifyPlaceIdentity'), source.indexOf('function applyDestinationDetails')), c);
  c.loadSavedData = () => ({ arrivals: [] });
  vm.runInContext(source.slice(source.indexOf('const CHALLENGE_EXCLUDED_CATEGORIES'), source.indexOf('async function executeSearch')), c);
  return c;
}
const feature = (id, lat, name = id) => ({properties: {place_id:id, name, lat, lon:0, formatted:'住所'}});
test('調査情報は名称補完・ID統合前の各API応答を分離して保持する', async () => {
  const c = fixture(async url => ({ok:true,json:async()=>({features:[{properties:{
    place_id:'shared',lat:0.1,lon:0,address_line1:'道路名',
    ...(url.pathname === '/v2/places' ? {categories:['religion.place_of_worship'],datasource:{raw:{amenity:'place_of_worship'}}} : {name:'興林寺'})
  }}]})}));
  await c.searchGeoapify('カフェ',{lat:0,lng:0},1000,'ja');
  const records = [...c.fetchKeywordCandidates.diagnostics.values()];
  assert.equal(records.length,2);
  assert.equal(records.find(r=>r.source === '/v1/geocode/search').properties.name,'興林寺');
  const place = records.find(r=>r.source === '/v2/places').properties;
  assert.equal(Object.hasOwn(place,'name'),false);
  assert.equal(place.address_line1,'道路名');
  assert.equal(place.datasource.raw.amenity,'place_of_worship');
});
test('Geocodingは75%到達済みなら40件に拡張し、重複を除いて補充する', async () => {
  const urls = [];
  const first = Array.from({length:20}, (_, i) => feature(`first-${i}`, 0.1));
  const next = Array.from({length:20}, (_, i) => feature(`next-${i}`, 0.2));
  const c = fixture(async url => {
    urls.push(url);
    return {ok:true, json:async () => ({features:url.searchParams.get('limit') === '20' ? first : [...first, ...next]})};
  });
  c.loadSavedData = () => ({arrivals:first.slice(0,15).map(f => ({id:f.properties.place_id, muted:true}))});
  const result = await c.searchGeoapify('店名ABC', {lat:0,lng:0}, 1000, 'ja');
  assert.deepEqual(urls.map(url => url.searchParams.get('limit')), ['20','40']);
  assert.ok(urls.every(url => !url.searchParams.has('offset')));
  assert.equal(result.places.length, 40);
});
test('Geocodingは14件到達済みなら追加せず、解除済みも追加条件に数えない', async () => {
  let calls = 0;
  const first = Array.from({length:20}, (_, i) => feature(`first-${i}`, 0.1));
  const c = fixture(async () => { calls++; return {ok:true,json:async()=>({features:first})}; });
  c.loadSavedData = () => ({arrivals:first.map((f,i) => ({id:f.properties.place_id,muted:i < 14}))});
  await c.searchGeoapify('店名ABC', {lat:0,lng:0}, 1000, 'ja');
  assert.equal(calls, 1);
});
test('Placesはoffsetで補充し、Geocodingは繰り返さない', async () => {
  const urls = [];
  const first = Array.from({length:20}, (_, i) => feature(`first-${i}`, 0.1));
  const c = fixture(async url => {
    urls.push(url);
    const features = url.pathname.includes('/geocode/') ? []
      : url.searchParams.get('offset') === '0' ? first : [feature('next',0.2)];
    return {ok:true,json:async()=>({features})};
  });
  c.loadSavedData = () => ({arrivals:first.slice(0,15).map(f => ({id:f.properties.place_id,muted:true}))});
  const result = await c.searchGeoapify('カフェ', {lat:0,lng:0},1000,'ja');
  assert.equal(urls.filter(url => url.pathname.includes('/geocode/')).length, 1);
  assert.deepEqual(urls.filter(url => url.pathname === '/v2/places').map(url => url.searchParams.get('offset')), ['0','20']);
  assert.equal(result.places.length, 21);
});
test('補充は3回までで打ち切り、追加通信失敗時は取得済み候補を保持する', async () => {
  const urls = [];
  const all = Array.from({length:60}, (_,i)=>feature(`place-${i}`,0.1));
  const c = fixture(async url => {
    urls.push(url);
    return {ok:true,json:async()=>({features:all.slice(0,Number(url.searchParams.get('limit')))})};
  });
  c.loadSavedData = () => ({arrivals:all.map(f=>({id:f.properties.place_id,muted:true}))});
  const result = await c.searchGeoapify('店名ABC',{lat:0,lng:0},1000,'ja');
  assert.deepEqual(urls.map(url=>url.searchParams.get('limit')),['20','40','60']);
  assert.equal(result.places.length,60);
  c.fetchGeoapify.cache = [];
  c.fetch = async url => {
    if (url.searchParams.get('limit') !== '20') throw new Error('network');
    return {ok:true,json:async()=>({features:all.slice(0,20)})};
  };
  const partial = await c.searchGeoapify('店名ABC',{lat:0,lng:0},1000,'ja');
  assert.equal(partial.places.length,20);
  assert.equal(partial.partial,true);
});
test('ランダムシークレットは各分類の抽出前に到着圏内を除外する', async () => {
  const c = fixture(async () => ({ ok: true, json: async () => ({ features: [
    feature('inside', 0), feature('boundary', 0.02), feature('outside', 0.021)
  ] }) }));
  const random = await c.searchSecretChallenge({lat:0,lng:0}, 1000, 'ja', 'random');
  assert.equal(JSON.stringify(random.places.map(p => p.id)), '["outside"]');
  const nearest = await c.searchSecretChallenge({lat:0,lng:0}, 1000, 'ja', 'nearest');
  assert.equal(nearest.places.length, 3);
  c.fetchGeoapify.cache = [];
  c.fetch = async () => ({ ok: true, json: async () => ({ features: [
    feature('inside', 0), feature('boundary', 0.02)
  ] }) });
  const fallback = await c.searchSecretChallenge({lat:0,lng:0}, 1000, 'ja', 'random');
  assert.equal(fallback.places.length, 2);
});
test('シークレットは4分類を個別検索し、各分類から先頭以外もランダムに5件抽出する', async () => {
  const urls = [];
  const c = fixture(async url => {
    urls.push(url);
    const group = urls.length;
    return { ok: true, json: async () => ({ features:
      Array.from({ length: 10 }, (_, i) => feature(`${group}-${i}`, (i + 1) / 100))
    }) };
  });
  vm.runInContext('Math.random = () => 0.999', c);
  const result = await c.searchSecretChallenge({lat:0,lng:0}, 1000, 'ja', 'random');
  assert.equal(urls.length, 4);
  const groups = vm.runInContext("CHALLENGE_GROUPS.filter(g => g.id !== 'secret')", c);
  urls.forEach((url, i) => {
    assert.equal(url.pathname, '/v2/places');
    assert.equal(url.searchParams.get('categories'), groups[i].categories.join(','));
    assert.equal(url.searchParams.get('limit'), '20');
  });
  assert.equal(result.places.length, 20);
  for (let group = 1; group <= 4; group++) {
    assert.equal(result.places.filter(p => p.id.startsWith(`${group}-`)).length, 5);
    assert.ok(result.places.some(p => p.id === `${group}-9`));
  }
  assert.equal(result.partial, false);
});

test('シークレットは少数・0件・分類間重複・ミュートを扱い、一部失敗でも検索を継続する', async () => {
  let calls = 0;
  const c = fixture(async () => {
    const group = calls++;
    if (group === 3) throw new Error('network');
    return { ok: true, json: async () => ({ features: group === 2 ? [] :
      [feature('shared', 0.1), feature(`group-${group}`, 0.2), feature('muted', 0.1)]
    }) };
  });
  c.currentLang = 'ja';
  vm.runInContext(source.slice(source.indexOf('function geoapifyPlaceIdentity'), source.indexOf('function applyDestinationDetails')), c);
  c.loadSavedData = () => ({ arrivals: [{ id: 'muted', muted: true }] });
  const result = await c.searchSecretChallenge({lat:0,lng:0}, 1000, 'ja', 'random');
  assert.equal(result.places.length, 3);
  assert.equal(new Set(result.places.map(p => p.id)).size, 3);
  assert.ok(!result.places.some(p => p.id === 'muted'));
  assert.equal(result.partial, true);
});

test('最寄りシークレットは5件に絞らず、全失敗と正常な0件を区別する', async () => {
  let calls = 0;
  const c = fixture(async () => {
    const group = calls++;
    return { ok: true, json: async () => ({ features:
      Array.from({ length: 8 }, (_, i) => feature(`${group}-${i}`, (i + 1) / 100))
    }) };
  });
  assert.equal((await c.searchSecretChallenge({lat:0,lng:0}, 1000, 'ja', 'nearest')).places.length, 32);
  c.fetchGeoapify.cache = [];
  c.fetch = async () => ({ ok: false, status: 400 });
  await assert.rejects(c.searchSecretChallenge({lat:0,lng:0}, 1000, 'ja', 'random'));
  c.fetch = async () => ({ ok: true, json: async () => ({ features: [] }) });
  const result = await c.searchSecretChallenge({lat:0,lng:0}, 1000, 'ja', 'random');
  assert.equal(result.places.length, 0);
  assert.equal(result.partial, false);
  c.window.SENSOR_CONFIG.geoapifyApiKey = '';
  await assert.rejects(c.searchSecretChallenge({lat:0,lng:0}, 1000, 'ja', 'random'),
    error => error.code === 'SEARCH_NOT_CONFIGURED');
});
test('検索キャッシュは5m以内・5日未満・同じ条件で共有し、変更を分離する', async () => {
  let calls = 0;
  let now = 1000;
  const c = fixture(async () => { calls++; return {ok:true,json:async()=>({features:[feature('a',0.1)]})}; });
  c.Date = { now: () => now };
  c.getDistance = (lat, lng, otherLat, otherLng) => Math.hypot(otherLat-lat,otherLng-lng) * 1000;
  const params = (lat, text='店名') => ({filter:`circle:0,${lat},1000`,bias:`proximity:0,${lat}`,text,limit:20,lang:'ja'});
  const first = await c.fetchGeoapify('/v1/geocode/search',params(0));
  first[0].properties.name = 'modified';
  const cached = await c.fetchGeoapify('/v1/geocode/search',params(0.005));
  assert.equal(calls,1);
  assert.equal(cached[0].properties.name,'a');
  await c.fetchGeoapify('/v1/geocode/search',params(0.006));
  assert.equal(calls,2);
  await c.fetchGeoapify('/v1/geocode/search',params(0,'別の店名'));
  assert.equal(calls,3);
  now += 5 * 24 * 60 * 60 * 1000;
  await c.fetchGeoapify('/v1/geocode/search',params(0));
  assert.equal(calls,4);
});
test('検索と詳細を再起動後も5日保持し、期限切れ・言語変更時に取得する', async () => {
  const stored = new Map();
  const storage = {getItem:key=>stored.get(key) || null,setItem:(key,value)=>stored.set(key,value)};
  let calls = 0;
  let now = 1000;
  const fetch = async () => { calls++; return {ok:true,json:async()=>({features:[feature('persisted',0.1)]})}; };
  const first = fixture(fetch);
  first.localStorage = storage;
  first.Date = {now:()=>now};
  const search = {filter:'circle:0,0,1000',bias:'proximity:0,0',text:'店名',limit:20,lang:'ja'};
  const details = {id:'persisted',features:'details',lang:'ja'};
  await Promise.all([first.fetchGeoapify('/v1/geocode/search',search),first.fetchGeoapify('/v2/place-details',details)]);
  assert.equal(calls,2);
  assert.ok(![...stored.values()].join('').includes('test-only-placeholder'));
  const restarted = fixture(fetch);
  restarted.localStorage = storage;
  restarted.Date = {now:()=>now};
  now += 4 * 24 * 60 * 60 * 1000;
  await restarted.fetchGeoapify('/v1/geocode/search',search);
  const cachedDetails = await restarted.fetchGeoapify('/v2/place-details',details);
  assert.equal(calls,2);
  assert.equal(cachedDetails.cacheExpires,1000 + 5 * 24 * 60 * 60 * 1000);
  await restarted.fetchGeoapify('/v2/place-details',{...details,lang:'en'});
  assert.equal(calls,3);
  now += 24 * 60 * 60 * 1000;
  await restarted.fetchGeoapify('/v1/geocode/search',search);
  await restarted.fetchGeoapify('/v2/place-details',details);
  assert.equal(calls,5);
});
test('チャレンジも20件単位で補充し、500件の一括取得をしない', async () => {
  const urls = [];
  const first = Array.from({length:20},(_,i)=>feature(`visited-${i}`,0.1));
  const c = fixture(async url => {
    urls.push(url);
    return {ok:true,json:async()=>({features:url.searchParams.get('offset') === '0' ? first : [feature('new',0.2)]})};
  });
  c.loadSavedData = () => ({arrivals:first.slice(0,15).map(f=>({id:f.properties.place_id,muted:true}))});
  const result = await c.searchGeoapify('challenge',{lat:0,lng:0},1000,'ja',['catering.cafe']);
  assert.deepEqual(urls.map(url=>url.searchParams.get('limit')),['20','20']);
  assert.deepEqual(urls.map(url=>url.searchParams.get('offset')),['0','20']);
  assert.equal(result.places.length,21);
});
test('文字とカテゴリを同時検索し、ID重複・範囲外・無効座標を除く', async () => {
  const urls = [];
  const c = fixture(async url => {
    urls.push(url);
    const features = url.pathname.includes('/places')
      ? [feature('shared', 0.1), feature('near', 0.05), feature('outside', 2)]
      : [feature('shared', 0.1), feature('bad', NaN)];
    return {ok:true, json:async () => ({features})};
  });
  const result = await c.searchGeoapify('カフェ', {lat:0,lng:0}, 1000, 'ja');
  assert.equal(urls.length, 2);
  assert.ok(urls.every(url => url.origin === 'https://api.geoapify.com'));
  assert.ok(urls.every(url => url.searchParams.get('apiKey') === 'test-only-placeholder'));
  assert.equal(urls[0].searchParams.get('text'), 'カフェ');
  assert.equal(urls[1].searchParams.get('categories'), 'catering.cafe');
  assert.equal(urls[1].searchParams.get('limit'), '20');
  assert.ok(urls.every(url => url.searchParams.get('filter') === 'circle:0,0,1000'));
  assert.equal(JSON.stringify(result.places.map(p=>p.id)), '["near","shared"]');
  assert.equal(result.partial, false);
});
test('カテゴリにない店名は文字検索のみ、片方の失敗は成功側を使用', async () => {
  let calls = 0;
  const c = fixture(async url => {
    calls++;
    if (url.pathname.includes('/places')) throw new Error('network');
    return {ok:true, json:async () => ({features:[feature('a',0.1)]})};
  });
  await c.searchGeoapify('店名ABC', {lat:0,lng:0}, 1000, 'ja');
  assert.equal(calls, 1);
  const partial = await c.searchGeoapify('cafe', {lat:0,lng:0}, 1000, 'en');
  assert.equal(partial.partial, true);
  assert.equal(partial.places.length, 1);
});
test('全検索失敗と正常な0件を区別する', async () => {
  const c = fixture(async () => ({ok:false, status:403}));
  await assert.rejects(c.searchGeoapify('cafe', {lat:0,lng:0}, 1000, 'en'));
  c.fetch = async () => ({ok:true, json:async () => ({features:[]})});
  assert.equal((await c.searchGeoapify('cafe', {lat:0,lng:0}, 1000, 'en')).places.length, 0);
});

test('設定が未入力または仮のキーなら通信せずに設定エラーを返す', async () => {
  let calls = 0;
  const c = fixture(async () => { calls++; });
  for (const key of [undefined, '', 'YOUR_GEOAPIFY_API_KEY']) {
    c.window.SENSOR_CONFIG.geoapifyApiKey = key;
    await assert.rejects(c.searchGeoapify('cafe', {lat:0,lng:0}, 1000, 'en'), error => error.code === 'SEARCH_NOT_CONFIGURED');
  }
  assert.equal(calls, 0);
});

test('チャレンジは指定カテゴリのみ検索し、チャレンジ名の文字検索を混ぜない', async () => {
  const urls = [];
  const c = fixture(async url => {
    urls.push(url);
    return {ok:true, json:async () => ({features:[feature('category-target', 0.1)]})};
  });
  const result = await c.searchGeoapify('グルメ1kmランダム', {lat:0,lng:0}, 1000, 'ja',
    ['catering.restaurant', 'catering.cafe']);
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, '/v2/places');
  assert.equal(urls[0].searchParams.get('categories'), 'catering.restaurant,catering.cafe');
  assert.equal(urls[0].searchParams.has('text'), false);
  assert.equal(result.places[0].id, 'category-target');
});


test('チャレンジは複数カテゴリ登録の酒類・成人向け施設も除外する', async () => {
  const tagged = (id, categories) => ({ ...feature(id, 0.1), properties: {
    ...feature(id, 0.1).properties, categories
  }});
  const c = fixture(async url => {
    assert.equal(url.searchParams.get('limit'), '20');
    return { ok: true, json: async () => ({ features: [
      tagged('family', ['catering.restaurant', 'catering.restaurant.ramen']),
      tagged('bar', ['catering.restaurant', 'catering.bar']),
      tagged('pub', ['catering.pub']),
      tagged('adult', ['entertainment', 'adult.nightclub']),
      feature('unknown', 0.1)
    ] }) };
  });
  const result = await c.searchGeoapify('challenge', {lat:0,lng:0}, 1000, 'ja', ['catering.restaurant']);
  assert.equal(JSON.stringify(result.places.map(p => p.id)), '["family","unknown"]');
});

test('生活サービスを広く検索しても成人向けの複合カテゴリ・元データタグを除外する', async () => {
  const c = fixture(async () => ({ok:true,json:async()=>({features:[
    {...feature('salon',0.1),properties:{...feature('salon',0.1).properties,categories:['service.beauty.hairdresser']}},
    {...feature('adult',0.1),properties:{...feature('adult',0.1).properties,categories:['service.beauty.massage','adult.brothel']}},
    {...feature('raw-adult',0.1),properties:{...feature('raw-adult',0.1).properties,categories:['service'],datasource:{raw:{amenity:'brothel'}}}},
    {...feature('erotic',0.1),properties:{...feature('erotic',0.1).properties,categories:['commercial.erotic']}}
  ]})}));
  const result = await c.searchGeoapify('',{lat:0,lng:0},1000,'ja',['service','amenity']);
  assert.deepEqual(Array.from(result.places,p=>p.id),['salon']);
});
