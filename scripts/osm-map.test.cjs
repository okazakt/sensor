'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const maps = [];
  const observers = [];
  class Map {
    constructor(options) { this.options = options; this.events = {}; this.paint = {}; maps.push(this); }
    on(name, callback) { this.events[name] = callback; }
    once(name, callback) { this.on(name, callback); }
    getContainer() { return {}; }
    setCenter(center) { this.center = center; }
    isStyleLoaded() { return !!this.ready; }
    areTilesLoaded() { return !!this.ready; }
    setPaintProperty(layer, property, value) {
      assert.ok(this.ready, 'cannot repaint a map before its style is ready');
      this.paint[layer + ':' + property] = value;
    }
    resize() { this.resized = true; }
    remove() { this.removed = true; }
  }
  class ResizeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const context = { window: { maplibregl: { Map } }, ResizeObserver };
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  vm.runInNewContext(source.slice(source.indexOf('function initializeMapRenderer(global)'),
    source.indexOf('function initializeResponsiveLayout()')), context);
  return { api: context.window.SensorMap, maps, observers };
}

test('OSM地図はGoogleなしで作成でき、緯度・経度の順序と表示倍率を変換する', () => {
  const { api, maps } = fixture();
  const map = api.createMap('map', { lat: 35, lng: 139 }, 'botw');
  assert.deepEqual(Array.from(maps[0].options.center), [139, 35]);
  assert.equal(maps[0].options.zoom, 16);
  map.setCenter({ lat: 36, lng: 140 });
  assert.deepEqual(Array.from(maps[0].center), [140, 36]);
});

test('読み込み中のテーマ変更は最後の選択を適用し、タイルを再取得しない', () => {
  const { api, maps } = fixture();
  const map = api.createMap('map', { lat: 35, lng: 139 }, 'botw');
  map.setStyle('sheikah');
  map.setStyle('botw');
  map.setStyle('sheikah');
  assert.equal(Object.keys(maps[0].paint).length, 0);
  maps[0].ready = true;
  maps[0].events.load();
  assert.equal(maps[0].paint['background:background-color'], '#081018');
  map.setStyle('botw');
  assert.equal(maps[0].paint['background:background-color'], '#453820');
  assert.equal(maps[0].paint['road-fill:line-color'], '#e4d5a8');
});

test('地図の破棄でサイズ監視も終了し、配信エラーを表示・復旧する', () => {
  const { api, maps, observers } = fixture();
  const status = { hidden: true };
  const map = api.createMap('detail', { lat: 35, lng: 139 }, 'botw', status);
  maps[0].events.error();
  assert.equal(status.hidden, false);
  maps[0].ready = true;
  maps[0].events.sourcedata({ sourceId: 'openmaptiles', sourceDataType: 'content' });
  assert.equal(status.hidden, true);
  observers[0].callback();
  assert.equal(maps[0].resized, true);
  map.remove();
  assert.equal(observers[0].disconnected, true);
  assert.equal(maps[0].removed, true);
});

test('コンパス回転は北をまたぐ最短方向で補間し、出典を回転しない', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  const frames = [];
  const mapElement = { style: {} };
  const context = {
    document: { getElementById(id) { assert.equal(id, 'map'); return mapElement; } },
    appState: { visualMapRotation: -359 },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('let mapRotationFrame ='),
    source.indexOf('function enterStoppedState')), context);
  vm.runInContext('rotateMapSmoothly(1)', context);
  let timestamp = 0;
  let iterations = 0;
  while (frames.length && iterations++ < 100) frames.shift()(timestamp += 16);
  assert.ok(iterations < 100, 'rotation should settle');
  assert.ok(Math.abs(context.appState.visualMapRotation + 361) < 0.001);
  assert.ok(Math.abs(Number(mapElement.style.transform.slice(7, -4)) + 361) < 0.001);
});

function positionFixture() {
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  let clock = 0;
  const frames = [];
  const context = {
    appState: { isWalking: false }, performance: { now: () => clock },
    requestAnimationFrame(callback) { frames.push(callback); return 1; },
    headingDelta: (target, current) => ((target - current + 540) % 360) - 180
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('let map = null;'),
    source.indexOf('function initMap(')) +
    source.slice(source.indexOf('function updateMapPositionSmoothly('),
      source.indexOf('function bootstrapMapAndLocation()')) +
    source.slice(source.indexOf('function getDistance('), source.indexOf('let radarTimer =')), context);
  vm.runInContext('map = { setCenter() {} }', context);
  return {
    fix(lng, speed = 30, heading = 90, accuracy = 5) {
      context.coords = { latitude: 35, longitude: lng, speed, heading, accuracy };
      context.now = clock;
      vm.runInContext('updateMapPositionSmoothly(coords, now)', context);
    },
    advance(ms) {
      const end = clock + ms;
      while (clock < end) {
        clock = Math.min(end, clock + 16);
        const callback = frames.shift();
        if (callback) callback(clock);
      }
    },
    center: () => vm.runInContext('({...visualMapCenter})', context),
    pending: () => frames.length
  };
}

test('高速移動はGPS更新間も進み続け、途絶時は予測を終了する', () => {
  const f = positionFixture();
  f.fix(139);
  f.advance(1000);
  f.fix(139.00033);
  f.advance(800);
  const first = f.center().lng;
  f.advance(400);
  assert.ok(f.center().lng > first + 0.00008, 'continues moving between fixes');
  assert.ok(f.center().lng > 139.00033, 'predicts beyond latest fix');
  f.advance(5000);
  assert.equal(f.pending(), 0, 'stale prediction settles');
  assert.ok(f.center().lng < 139.001, 'prediction distance is bounded');
});

test('停止情報・精度不良で予測をやめ、速度欠落時は位置差から補う', () => {
  for (const badAccuracy of [false, true]) {
    const f = positionFixture();
    f.fix(139);
    f.advance(1000);
    f.fix(139.00015, null, null);
    f.advance(1200);
    assert.ok(f.center().lng > 139.00015, 'infers velocity without GPS speed/heading');
    f.fix(139.00015, 0, null, badAccuracy ? 100 : 5);
    f.advance(5000);
    assert.equal(f.pending(), 0);
    assert.ok(Math.abs(f.center().lng - 139.00015) < 0.000002);
  }
});

test('通常ズームのゼルダ風地図は住宅街・細街路も太く描き、ズーム式を最上位に保つ', () => {
  const { api } = fixture();
  const day = api.createStyle('botw');
  const night = api.createStyle('sheikah');
  for (const id of ['road-fill', 'road-casing', 'highway-fill', 'highway-casing']) {
    const width = day.layers.find(layer => layer.id === id).paint['line-width'];
    assert.equal(width[0], 'interpolate');
    assert.equal(width[2][0], 'zoom');
  }
  const highway = style => style.layers.find(layer => layer.id === 'highway-fill').paint['line-width'];
  assert.ok(highway(day)[8] > highway(night)[8] * 1.15);
  const roadAtNormalZoom = style => style.layers.find(layer => layer.id === 'road-fill').paint['line-width'][8];
  const matchWidth = (expression, roadClass) => {
    for (let i = 2; i < expression.length - 1; i += 2) {
      if (expression[i] === roadClass) return expression[i + 1];
    }
    return expression.at(-1);
  };
  for (const roadClass of ['primary', 'secondary', 'tertiary', 'minor', 'service']) {
    assert.ok(matchWidth(roadAtNormalZoom(day), roadClass) > matchWidth(roadAtNormalZoom(night), roadClass) * 1.15);
  }
  assert.ok(matchWidth(roadAtNormalZoom(day), 'minor') >= 9);
  assert.ok(matchWidth(roadAtNormalZoom(day), 'service') >= 6);
});

test('川幅は水面ポリゴンで描き、固定幅の中心線を重ねない', () => {
  const { api } = fixture();
  for (const theme of ['botw', 'sheikah']) {
    const style = api.createStyle(theme);
    const water = style.layers.find(layer => layer.id === 'water');
    assert.equal(water.type, 'fill');
    assert.equal(water['source-layer'], 'water');
    assert.equal(JSON.stringify(water.filter), '["==","$type","Polygon"]');
    assert.equal(style.layers.some(layer => layer['source-layer'] === 'waterway'), false);
    assert.ok(style.layers.indexOf(water) > style.layers.findIndex(layer => layer.id === 'building'));
    assert.ok(style.layers.indexOf(water) < style.layers.findIndex(layer => layer.id === 'road-fill'));
  }
});
