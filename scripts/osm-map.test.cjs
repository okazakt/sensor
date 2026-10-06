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
