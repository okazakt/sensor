'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(devicePixelRatio) {
  const maps = [];
  const observers = [];
  const markers = [];
  function element() {
    return {style:{}, children:[], clientWidth:320, clientHeight:320,
      appendChild(child) {child.parentElement=this;this.children.push(child);},
      remove() {if (this.parentElement) this.parentElement.children=this.parentElement.children.filter(child => child!==this);}};
  }
  const elements = {map:element(), detail:element()};
  class Map {
    constructor(options) { this.options = options; this.events = {}; this.paint = {}; this.centerCalls = 0;
      this.container = typeof options.container === 'string' ? elements[options.container] : options.container;
      maps.push(this); }
    on(name, callback) { this.events[name] = callback; }
    once(name, callback) { this.on(name, callback); }
    getContainer() { return this.container; }
    getSource() { return { setData: data => { this.outlines = data; } }; }
    setCenter(center) { this.center = center; this.centerCalls++; }
    isStyleLoaded() { return !!this.ready; }
    areTilesLoaded() { return !!this.ready; }
    setPaintProperty(layer, property, value) {
      assert.ok(this.ready, 'cannot repaint a map before its style is ready');
      this.paint[layer + ':' + property] = value;
    }
    resize() { this.resized = true; }
    remove() { this.removed = true; this.removeCalls=(this.removeCalls || 0)+1; }
  }
  class ResizeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  class Marker {
    constructor(options) { this.options=options; markers.push(this); }
    setLngLat(position) { this.position=position; return this; }
    addTo(map) { this.map=map; return this; }
    remove() { this.removed=true; }
  }
  const context = { window: { maplibregl: { Map, Marker }, devicePixelRatio,
    document:{getElementById:id => elements[id],createElement:element},
    performance:{now:() => 0},
    setTimeout() { throw new Error('camera updates must not be delayed or throttled'); }
  }, ResizeObserver };
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  vm.runInNewContext(source.slice(source.indexOf('function initializeMapRenderer(global)'),
    source.indexOf('function initializeResponsiveLayout()')), context);
  return { api:context.window.SensorMap,maps,observers,elements,markers };
}

test('高密度端末でも地図の描画倍率を1.5倍以内に抑える', () => {
  const { api, maps } = fixture(3);
  api.createMap('map', {lat:35, lng:139}, 'botw');
  assert.equal(maps[0].options.pixelRatio, 1.5);
});

test('OSM地図はGoogleなしで作成でき、緯度・経度の順序と表示倍率を変換する', () => {
  const { api, maps } = fixture();
  const map = api.createMap('map', { lat: 35, lng: 139 }, 'botw');
  assert.deepEqual(Array.from(maps[0].options.center), [139, 35]);
  assert.equal(maps[0].options.zoom, 16);
  assert.equal(maps[0].options.maxTileCacheSize, 16);
  assert.equal(maps[0].options.pixelRatio, 1);
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
  assert.equal(maps[0].resized, undefined);
  maps[0].container.clientWidth = 360;
  observers[0].callback();
  assert.equal(maps[0].resized, true);
  map.remove();
  assert.equal(observers[0].disconnected, true);
  assert.equal(maps[0].removed, true);
});

test('60fpsの位置補間を間引かず、そのフレームで地図中心へ反映する', () => {
  const {api,maps,elements} = fixture(3);
  const map=api.createMap('map',{lat:35,lng:139},'botw');
  assert.equal(maps[0].options.container,'map');
  assert.equal(elements.map.children.length,0);
  for (let frame=1;frame<=300;frame++) {
    const position={lat:35,lng:139+frame*.0000003};
    map.setCenter(position);
    assert.equal(maps[0].centerCalls,frame);
    assert.deepEqual(Array.from(maps[0].center),[position.lng,position.lat]);
  }
});

test('同一位置・不正な位置・破棄後の更新と、非表示中のリサイズを無視する', () => {
  const {api,maps,observers,elements} = fixture();
  const map=api.createMap('map',{lat:35,lng:139},'botw');
  map.setCenter({lat:35,lng:139});
  map.setCenter({lat:NaN,lng:140});
  assert.equal(maps[0].centerCalls,0);
  map.setCenter({lat:36,lng:140});
  map.setCenter({lat:36,lng:141});
  assert.equal(maps[0].centerCalls,2);
  elements.map.clientWidth=0;
  observers[0].callback();
  assert.equal(maps[0].resized,undefined);
  map.remove(); map.remove();
  map.setCenter({lat:37,lng:142});
  assert.equal(maps[0].centerCalls,2);
  assert.equal(maps[0].removeCalls,1);
});

test('到着ピンは地図ライブラリのマーカーとして位置管理・削除する', () => {
  const {api,maps,markers} = fixture();
  const map=api.createMap('map',{lat:35,lng:139},'botw');
  const pin=map.addMarker({lat:35.001,lng:139.002},true,1,'Arrival');
  assert.equal(pin,markers[0]);
  assert.equal(pin.map,maps[0]);
  assert.deepEqual(Array.from(pin.position),[139.002,35.001]);
  assert.equal(pin.options.element.title,'Arrival');
  pin.remove();
  assert.equal(pin.removed,true);
});

test('コンパス回転は北をまたぐ最短方向で補間し、出典を回転しない', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  const frames = [];
  const mapElement = { style: {} };
  const northProperties = {};
  const mapRing = { style: { setProperty(name, value) { northProperties[name] = value; } } };
  const context = {
    document: { getElementById(id) {
      if (id === 'circle-map-wrapper') return mapRing;
      assert.equal(id, 'map'); return mapElement;
    } },
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
  assert.equal(northProperties['--map-north-rotation'], `${context.appState.visualMapRotation}deg`);
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

test('水面ポリゴンを優先し、面のない川は5pxの補助線で表示する', () => {
  const { api } = fixture();
  for (const theme of ['botw', 'sheikah']) {
    const style = api.createStyle(theme);
    const water = style.layers.find(layer => layer.id === 'water');
    assert.equal(water.type, 'fill');
    assert.equal(water['source-layer'], 'water');
    assert.equal(JSON.stringify(water.filter), '["==","$type","Polygon"]');
    const fallback = style.layers.find(layer => layer.id === 'waterway');
    assert.equal(fallback.type, 'line');
    assert.equal(fallback['source-layer'], 'waterway');
    assert.equal(fallback.paint['line-width'], 5);
    assert.equal(fallback.paint['line-color'], water.paint['fill-color']);
    assert.ok(style.layers.indexOf(fallback) < style.layers.indexOf(water));
    assert.ok(style.layers.indexOf(water) > style.layers.findIndex(layer => layer.id === 'building'));
    assert.ok(style.layers.indexOf(water) < style.layers.findIndex(layer => layer.id === 'road-fill'));
  }
});


test('輪郭は読み込み後に描画し、更新・消去しても中心や倍率を変えない', () => {
  const { api, maps } = fixture();
  const map = api.createMap('map', { lat:35, lng:139 }, 'botw');
  const geometry = { type:'Polygon', coordinates:[[[139,35],[139.01,35],[139.01,35.01],[139,35]]] };
  map.setOutlines([{geometry}]);
  assert.equal(maps[0].outlines, undefined);
  maps[0].ready = true;
  maps[0].events.load();
  assert.equal(maps[0].outlines.features[0].geometry, geometry);
  assert.equal(maps[0].center, undefined);
  assert.equal(maps[0].options.zoom,16);
  map.setStyle('sheikah');
  assert.equal(maps[0].paint['destination-edge:line-color'],'#8af5ff');
  map.setStyle('botw');
  assert.equal(maps[0].paint['destination-edge:line-color'],'#f5ce70');
  map.setOutlines([]);
  assert.equal(maps[0].outlines.features.length,0);
});
