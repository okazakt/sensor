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
  vm.runInContext(source.slice(source.indexOf('const CATEGORY_KEYWORDS'), source.indexOf('async function executeSearch')), c);
  return c;
}
const feature = (id, lat, name = id) => ({properties: {place_id:id, name, lat, lon:0, formatted:'住所'}});
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
