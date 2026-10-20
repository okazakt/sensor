/**
 * ============================================================
 * [JavaScript Version Management Specification]
 * - 採番形式: v0.[Year].[Month]1.[DateHourMinute]
 * - 日時: 日本時間（Asia/Tokyo、UTC+09:00）。Yearは西暦下2桁、Monthはゼロ埋めなし。
 * - 更新方法: node scripts/update-js-version.cjs（実行環境のタイムゾーンに依存しない）
 * ============================================================
 */
const BASE_JS_VERSION = "v0.26.101.210854";
// Opt-in, in-memory diagnostics. Coordinates and API keys are never recorded.
(function initializeDiagnostics(global) {
  if (new URLSearchParams(location.search).get('diagnostics') !== '1') return;
  const lines = [];
  const last = new Map();
  let output;
  global.SensorDiagnostics = {
    record(event, detail = '', throttle = 0) {
      const now = Date.now();
      if (throttle && now - (last.get(event) || 0) < throttle) return;
      last.set(event, now);
      lines.push(`${new Date(now).toLocaleTimeString()} ${event} ${detail}`);
      if (lines.length > 60) lines.shift();
      if (output) output.textContent = lines.join('\n');
    }
  };
  function show() {
    const panel = document.createElement('details');
    panel.open = true;
    panel.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:10000;background:#081018f5;color:#a7f3ff;border:1px solid #00cddb;border-radius:8px;padding:8px;font:12px monospace;max-height:38vh;overflow:auto';
    const title = document.createElement('summary');
    title.textContent = '診断ログ / Diagnostics';
    output = document.createElement('pre');
    output.style.cssText = 'white-space:pre-wrap;margin:8px 0;overflow-wrap:anywhere';
    panel.append(title, output);
    document.body.append(panel);
    output.textContent = lines.join('\n');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once:true });
  else show();
  global.SensorDiagnostics.record('startup', `secure=${global.isSecureContext} gps=${'geolocation' in navigator}`);
  try {
    const previousArrival = JSON.parse(sessionStorage.getItem('sheikah_arrival_trace') || '[]');
    if (Array.isArray(previousArrival)) previousArrival.slice(-12).forEach(entry => {
      global.SensorDiagnostics.record('arrival.previous', `${entry.phase} ${entry.time} ${entry.version}`);
    });
  } catch (_) {}
  global.addEventListener('error', event => global.SensorDiagnostics.record('js.error', event.message));
})(window);

function traceLocation(event, detail = '', throttle = 0) {
  window.SensorDiagnostics?.record(event, detail, throttle);
}

function traceArrivalStage(phase) {
  globalThis.SensorRuntimeDiagnostics?.event(`arrival.${phase}`);
  traceLocation(`arrival.${phase}`);
  // Keep a small trail across a renderer restart, without place IDs or coordinates.
  try {
    const previous = JSON.parse(sessionStorage.getItem('sheikah_arrival_trace') || '[]');
    const entries = Array.isArray(previous) ? previous.slice(-11) : [];
    entries.push({ phase, time: new Date().toISOString(), version: BASE_JS_VERSION });
    sessionStorage.setItem('sheikah_arrival_trace', JSON.stringify(entries));
  } catch (_) {}
}

// Enable only when diagnosing compass acquisition or heading.
const COMPASS_DEBUG_ENABLED = false;

/* OSM vector tiles use the OpenMapTiles schema. No Google drawing API is used here. */
function initializeMapRenderer(global) {
  'use strict';

  const ATTRIBUTION = '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> · Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> · Data from © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

  function createStyle(mode) {
    const day = mode === 'botw';
    // At the normal zoom (16), give residential roads a visible ribbon width.
    const roadWidth = ['interpolate', ['exponential', 1.5], ['zoom'],
      5, day ? 0.5 : 0.3, 12, day ? 2.5 : 1.5,
      16, day
        ? ['match', ['get', 'class'], 'primary', 12, 'secondary', 11, 'tertiary', 10, 'service', 6, 9]
        : ['match', ['get', 'class'], 'primary', 8, 'secondary', 7, 'tertiary', 6, 'service', 3, 5],
      19, day
        ? ['match', ['get', 'class'], 'primary', 42, 'secondary', 38, 'tertiary', 34, 'service', 18, 28]
        : ['match', ['get', 'class'], 'primary', 28, 'secondary', 25, 'tertiary', 22, 'service', 10, 18]];
    const majorWidth = ['interpolate', ['exponential', 1.5], ['zoom'],
      5, day ? 1 : 0.7, 12, day ? 4.5 : 3, 16, day ? 14 : 10, 19, day ? 46 : 30];
    const casingWidth = (width, border) => width.map((value, index) =>
      index >= 4 && index % 2 === 0
        ? (typeof value === 'number' ? value + border : ['+', value, border]) : value);
    const line = (id, filter, color, width) => ({
      id, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': width }
    });
    // Sidewalks and crossings are separate OSM paths, not extra carriageways.
    // Only road classes belong in these solid, road-width layers.
    const minor = ['in', 'class', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
    const major = ['in', 'class', 'motorway', 'trunk'];
    return {
      version: 8,
      sources: {
        'destination-outlines': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        openmaptiles: {
          type: 'vector', url: 'https://tiles.openfreemap.org/planet/latest',
          attribution: ATTRIBUTION
        }
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': day ? '#453820' : '#081018' } },
        { id: 'landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
          paint: { 'fill-color': day ? '#3f331c' : '#081018' } },
        { id: 'landuse', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
          paint: { 'fill-color': day ? '#483b23' : '#081018' } },
        { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
          paint: { 'fill-color': day ? '#453820' : '#081018', 'fill-outline-color': day ? '#483b23' : '#081018' } },
        // Preserve small waterways where riverbank polygons are unavailable.
        // Paint polygon water above the fallback centerlines.
        { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': day ? '#38485c' : '#02070d', 'line-width': 5 } },
        { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
          filter: ['==', '$type', 'Polygon'],
          paint: { 'fill-color': day ? '#38485c' : '#02070d' } },
        line('road-casing', minor, day ? '#2c2415' : '#142433', casingWidth(roadWidth, 1.2)),
        line('road-fill', minor, day ? '#e4d5a8' : '#142433', roadWidth),
        line('highway-casing', major, day ? '#221b0e' : '#142433', casingWidth(majorWidth, 1.5)),
        line('highway-fill', major, day ? '#f0e3bc' : '#142433', majorWidth),
        { id: 'destination-fill', type: 'fill', source: 'destination-outlines',
          paint: { 'fill-color': day ? '#f5ce70' : '#00e5f5', 'fill-opacity': day ? 0.07 : 0.05 } },
        { id: 'destination-halo', type: 'line', source: 'destination-outlines',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': day ? '#251b0c' : '#00e5f5', 'line-width': day ? 5 : 7,
            'line-opacity': day ? 0.8 : 0.25, 'line-blur': day ? 0 : 2 } },
        { id: 'destination-edge', type: 'line', source: 'destination-outlines',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': day ? '#f5ce70' : '#8af5ff', 'line-width': 2, 'line-opacity': 0.95 } }
      ]
    };
  }

  function markerElement(day, opacity) {
    const element = global.document.createElement('div');
    element.className = 'osm-arrival-marker';
    element.innerHTML = day
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="#ffee33" stroke-width="2.5" opacity="${opacity}"/><circle cx="14" cy="14" r="13" fill="none" stroke="#6e5426" stroke-width="1.2" opacity="${opacity * 0.8}"/><circle cx="14" cy="14" r="4.5" fill="#ffee33" opacity="${opacity}"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="8" fill="#00f3ff" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="2" stroke-opacity="${opacity}"/></svg>`;
    return element;
  }

  function createMap(container, position, mode, statusElement) {
    let theme = mode;
    let styleReady = false;
    let outlines = [];
    let outlinesSignature = '[]';
    let removed = false;
    let centerTarget = { ...position };
    function repaintOutlines() {
      instance.getSource('destination-outlines').setData({ type: 'FeatureCollection',
        features: outlines.map(geometry => ({ type: 'Feature', properties: {}, geometry })) });
    }
    const instance = new global.maplibregl.Map({
      container, style: createStyle(mode), center: [position.lng, position.lat],
      // MapLibre uses 512px tiles; Google zoom 17 has the same scale as zoom 16.
      zoom: 16, interactive: false, attributionControl: false,
      // Bound GPU buffers on high-density phones and retained tiles while moving.
      pixelRatio: Math.min(global.devicePixelRatio || 1, 1.5), maxTileCacheSize: 16,
      canvasContextAttributes: { powerPreference: 'low-power' }
    });
    global.SensorRuntimeDiagnostics?.count('map.created');
    instance.on('webglcontextlost', () => {
      global.SensorRuntimeDiagnostics?.event('map.context-lost');
      if (statusElement) statusElement.hidden = false;
    });
    instance.on('webglcontextrestored', () => global.SensorRuntimeDiagnostics?.event('map.context-restored'));
    if (statusElement) {
      instance.on('error', event => {
        statusElement.hidden = false;
        global.SensorRuntimeDiagnostics?.count('map.error');
        global.SensorDiagnostics?.record('map.error', event.error?.status ? `status=${event.error.status}` : 'tile/render error', 2000);
      });
      instance.on('sourcedata', event => {
        if (event.sourceId === 'openmaptiles' && event.sourceDataType === 'content' &&
            instance.areTilesLoaded()) { statusElement.hidden = true; global.SensorDiagnostics?.record('map.tiles.loaded', '', 3000); }
      });
    }
    const element = instance.getContainer();
    let width = element.clientWidth, height = element.clientHeight;
    const resizeObserver = new ResizeObserver(() => {
      if (removed || element.clientWidth <= 0 || element.clientHeight <= 0 ||
          (width === element.clientWidth && height === element.clientHeight)) return;
      width = element.clientWidth; height = element.clientHeight;
      instance.resize();
      global.SensorRuntimeDiagnostics?.count('map.resize');
    });
    resizeObserver.observe(element);
    function repaintTheme() {
      createStyle(theme).layers.forEach(layer => {
        Object.entries(layer.paint).forEach(([property, value]) =>
          instance.setPaintProperty(layer.id, property, value));
      });
    }
    instance.once('load', () => {
      styleReady = true;
      global.SensorDiagnostics?.record('map.loaded');
      if (outlines.length) repaintOutlines();
      if (theme !== mode) repaintTheme();
    });
    return {
      // MapLibre clips these native layers to the canvas; never fit the camera to the area.
      setOutlines(places) {
        const next = places.map(place => place.geometry).filter(geometry =>
          geometry && ['Polygon', 'MultiPolygon'].includes(geometry.type));
        if (next.length === outlines.length && next.every((geometry, index) => geometry === outlines[index])) return;
        const signature = JSON.stringify(next);
        outlines = next;
        if (signature === outlinesSignature) return;
        outlinesSignature = signature;
        if (styleReady) repaintOutlines();
      },
      setCenter: position => {
        if (removed || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return;
        if (Math.abs(position.lat - centerTarget.lat) < 0.0000000001 &&
            Math.abs(position.lng - centerTarget.lng) < 0.0000000001) return;
        centerTarget = { ...position };
        // Apply every animation frame supplied by the GPS interpolation.
        // MapLibre reuses its tile cache while updating camera/marker positions.
        instance.setCenter([position.lng, position.lat]);
        global.SensorRuntimeDiagnostics?.count('map.center');
        global.SensorDiagnostics?.record('map.setCenter', '', 2000);
      },
      setStyle: mode => {
        // Both themes have identical layers and data. Repaint without reloading tiles.
        theme = mode;
        if (styleReady) repaintTheme();
      },
      addMarker(position, day, opacity = 1, title = '') {
        const element = markerElement(day, opacity);
        element.title = title;
        return new global.maplibregl.Marker({ element, rotationAlignment: 'map' })
          .setLngLat([position.lng, position.lat]).addTo(instance);
      },
      remove() {
        if (removed) return;
        removed = true;
        resizeObserver.disconnect(); instance.remove();
        global.SensorRuntimeDiagnostics?.count('map.removed');
      }
    };
  }

  global.SensorMap = { createMap, createStyle, attribution: ATTRIBUTION };
}
initializeMapRenderer(window);

// Fit text to the actual space remaining after icons, padding and separators.
function initializeResponsiveLayout() {
  const standalone = window.matchMedia('(display-mode: standalone)');
  function updateDisplayMode() {
    document.documentElement.classList.toggle('is-standalone', standalone.matches || navigator.standalone === true);
  }
  standalone.addEventListener('change', updateDisplayMode);
  updateDisplayMode();
  // Scroll offsets from the landscape controls must not survive rotation.
  const orientation = window.matchMedia('(orientation: landscape)');
  let rotationTimers = [];
  function resetRotationOffsets() {
    rotationTimers.forEach(clearTimeout);
    const reset = () => {
      document.scrollingElement?.scrollTo(0, 0);
      window.scrollTo(0, 0);
      for (const selector of ['#app-container', '#page-main-wrap', '.bottom-section']) {
        const element = document.querySelector(selector);
        if (element) { element.scrollTop = 0; element.scrollLeft = 0; }
      }
      schedule();
    };
    reset();
    // Safari applies safe areas and viewport geometry after the rotation event.
    rotationTimers = [150, 400].map(delay => setTimeout(reset, delay));
  }
  orientation.addEventListener('change', resetRotationOffsets);
  window.addEventListener('orientationchange', resetRotationOffsets);
  const labels = [...document.querySelectorAll(
    '#label-sound-state, #label-wake-state, #label-pulse-state, .volume-label, .condition-label'
  )];
  const toasts = [...document.querySelectorAll('.sound-mode-toast:not(#volume-mode-toast), #toast-text')];
  let pending = false;
  function fit(element, maximum, heightLimit) {
    if (!element.clientWidth || !element.textContent.trim()) return;
    let low = 1;
    let high = maximum;
    for (let i = 0; i < 12; i++) {
      const size = (low + high) / 2;
      element.style.fontSize = `${size}px`;
      if (element.scrollWidth <= element.clientWidth &&
          (!heightLimit || element.scrollHeight <= heightLimit)) low = size;
      else high = size;
    }
    const fitted = Math.floor(low * 10) / 10;
    element.style.fontSize = `${fitted}px`;
    return fitted;
  }
  function update() {
    pending = false;
    const panel = document.querySelector('.bottom-section');
    const panelStyle = getComputedStyle(panel);
    const panelWidth = panel.clientWidth - parseFloat(panelStyle.paddingLeft) - parseFloat(panelStyle.paddingRight);
    const sizes = labels.map(label => fit(label, Math.min(12.5, panelWidth * 0.033))).filter(Number.isFinite);
    const sharedSize = Math.min(...sizes);
    if (sizes.length) labels.forEach(label => { label.style.fontSize = `${sharedSize}px`; });
    toasts.forEach(toast => {
      const box = toast.id === 'toast-text' ? toast.parentElement : toast;
      const css = getComputedStyle(box);
      const availableHeight = box.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
      fit(toast, Math.min(13, box.clientWidth * 0.035), toast === box ? box.clientHeight : availableHeight);
    });
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }
  const resize = new ResizeObserver(schedule);
  resize.observe(document.querySelector('#app-container'));
  resize.observe(document.querySelector('.bottom-section'));
  const mutations = new MutationObserver(schedule);
  [...labels, ...toasts].forEach(element => {
    mutations.observe(element, { childList: true, characterData: true, subtree: true });
  });
  document.fonts.ready.then(schedule);
  schedule();
}
initializeResponsiveLayout();


function updateDisplayedVersion() {
  const metaTag = document.querySelector('meta[name="html-rev"]');
  const htmlRev = metaTag ? metaTag.getAttribute('content') : "11";

  const computedStyle = getComputedStyle(document.documentElement);
  let cssRev = computedStyle.getPropertyValue('--css-rev').trim().replace(/['"]/g, '');
  if (!cssRev) cssRev = "07";

  const fullVersion = `${BASE_JS_VERSION}.${htmlRev}.${cssRev}`;
  window.SensorRuntimeDiagnostics?.setVersion(fullVersion);
  
  document.querySelectorAll('.app-build-ver-span').forEach(el => {
    el.textContent = fullVersion;
  });
}

updateDisplayedVersion();

function initializeNavigationSystem() {
  updateDisplayedVersion();

  setupDataTransferEasterEgg();
  setupSwipeAndNavigationSystem();
}

// script.js は index.html から動的に読み込まれるため、
// DOMContentLoaded が既に発生した後でも初期化処理を実行できるようにする。
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeNavigationSystem, 0);
  }, { once: true });
} else {
  setTimeout(initializeNavigationSystem, 0);
}

const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const CACHE_CHECK_KEY = 'sheikah_last_cache_time';
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const UPDATE_RESUME_IDLE_TIME = 10 * 60 * 1000;
let startupRefreshPending = false;
let updateHiddenSince = document.visibilityState === 'hidden' ? Date.now() : null;

// Startup refresh can run before currentLang and I18N have been initialized.
function startupRefreshText(lang) {
  const language = lang || localStorage.getItem('sheikah_lang') || window.navigator?.language || 'ja';
  return language.toLowerCase().startsWith('ja') ? {
    title: '更新を確認中', description: '準備ができるまで少しお待ちください。', button: '更新確認中…'
  } : {
    title: 'Checking for updates', description: 'Please wait a moment.', button: 'Checking for updates…'
  };
}

function isUpdateReloadBlocked() {
  return document.visibilityState !== 'visible' ||
    appState.isTracking || Boolean(appState.activeChallenge) || isSearchInProgress ||
    arrivalInProgressId !== null || rewardedSearchPending || challengeStartPending ||
    compassPermissionPending || locationAccessState === 'waiting' ||
    Boolean(document.getElementById('challenge-presentation')?.classList.contains('is-visible'));
}

function showStartupRefresh() {
  const text = startupRefreshText();
  document.getElementById('pwa-prompt-overlay').classList.remove('show');
  document.getElementById('safety-prompt-overlay').classList.add('show');
  document.getElementById('safety-prompt-title').textContent = text.title;
  document.getElementById('safety-prompt-desc').textContent = text.description;
  document.getElementById('btn-safety-ok').textContent = text.button;
  document.getElementById('btn-safety-ok').disabled = true;
}

function reloadForUpdate(startup = false) {
  if (startupRefreshPending) return true;
  // A blocked resume is skipped completely. Finishing exploration or a banner
  // must not trigger a reload while the user is operating the app.
  if (!startup && isUpdateReloadBlocked()) return false;
  startupRefreshPending = true;
  localStorage.setItem(CACHE_CHECK_KEY, Date.now().toString());
  showStartupRefresh();
  traceLocation('update.reload.pending');
  const clearCaches = 'caches' in window
    ? caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))))
    : Promise.resolve();
  clearCaches.catch(() => {}).then(() => {
    traceLocation('update.reload');
    window.SensorRuntimeDiagnostics?.plannedReload('startup-update');
    window.location.reload();
  });
  return true;
}

const nowTime = Date.now();
const lastCacheTime = parseInt(localStorage.getItem(CACHE_CHECK_KEY) || '0', 10);
const firstStandaloneLaunch = isStandaloneMode && !sessionStorage.getItem('sheikah_pwa_refreshed');
if (firstStandaloneLaunch) sessionStorage.setItem('sheikah_pwa_refreshed', 'true');
if (!lastCacheTime) localStorage.setItem(CACHE_CHECK_KEY, nowTime.toString());
if (firstStandaloneLaunch) reloadForUpdate(true);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (updateHiddenSince === null) updateHiddenSince = Date.now();
    // バックグラウンドでは方角センサーの更新が保証されないため、
    // 古い方角判定のまま探知音を鳴らし続けないよう停止する。
    if (radarTimer) {
      clearTimeout(radarTimer);
      radarTimer = null;
    }
    scheduledInterval = null;
    return;
  }

  if (document.visibilityState === 'visible') {
    const resumedAfterIdle = updateHiddenSince !== null &&
      Date.now() - updateHiddenSince >= UPDATE_RESUME_IDLE_TIME;
    updateHiddenSince = null;
    const storedTime = parseInt(localStorage.getItem(CACHE_CHECK_KEY) || '0', 10);
    if (resumedAfterIdle && storedTime && Date.now() - storedTime > TWENTY_FOUR_HOURS && reloadForUpdate()) {
      return;
    }

    if (locationAccessRequested && watchId === null && locationAccessState !== 'denied') requestLocationAccess();

    // 復帰後は現在の位置・方角情報から探知状態を再判定する。
    if (appState.isTracking && !appState.isPaused) {
      evaluateSensorCycle();
    }
  }
});

const I18N = {
  ja: {
    inputPlaceholder: "探す対象を入力...",
    btnSet: "SET",
    unvisited: "未踏:",
    detecting: "件探知中",
    detectingLocked: "件探知　対象1件をロック",
    locationInfoMissing: "位置情報を取得できていません",
    compassInfoMissing: "方位情報を取得できていません",
    sensorInfoMissing: "位置・方位情報を取得できていません",
    standby: "STANDBY",
    searching: "SEARCHING...",
    paused: "PAUSED",
    sensorActive: "SENSOR: ACTIVE",
    sensorPaused: "SENSOR: PAUSED",
    sensorStandby: "SENSOR: STANDBY",
    soundModeHeadphone: "for HEADPHONE",
    soundModeSpeaker: "for SPEAKER",
    soundModeMuted: "MUTED",
    soundModeHeadphoneDesc: "イヤホンモード：音楽と探知音を同時に再生できます。消音モードではイヤホンをご利用ください。",
    soundModeSpeakerDesc: "スピーカーモード：消音モードでも探知音を再生します。音楽などは停止する場合があります。音が出ない場合は、まずスピーカーモードに設定し直してください。改善しない場合は、アプリを開き直すか、再起動をお試しください。",
    soundModeMutedDesc: "サウンドOFF：探知音を再生しません。",
    wakeLockOn: "KEEP SCREEN ON",
    wakeLockOff: "KEEP SCREEN OFF",
    wakeLockOnDesc: "画面ON：使用中は画面が自動で消えないようにします。",
    wakeLockOffDesc: "画面OFF：端末の設定に従って画面が自動で消えます。",
    pulseRateDescriptions: {
      max: "探知信号：最速（標準の間隔）",
      mid: "探知信号：中速（標準の2倍の間隔）",
      low: "探知信号：低速（標準の4倍の間隔）"
    },
    langSwitchLabel: "→EN",
    footerTip: "※消音時も円周の光とフラッシュで反応",
    keywordsTitle: "探索履歴一覧",
    filterKeywordsPlaceholder: "キーワード絞り込み...",
    filterHistoryPlaceholder: "到達スポット絞り込み...",
    sortSearch: "検索日時順",
    sortArrival: "到達日時順",
    sortCount: "到達件数降順",
    cleanZeroBtn: "到達0件の履歴を一括削除",
    deleteCurrentKeyBtn: "このキーワードの履歴を一括削除",
    backToKeywords: "◀探索履歴一覧",
    backToHistory: "◀履歴図鑑一覧",
    spotDetailTitle: "図鑑詳細",
    allHistoryTitle: "図鑑一覧",
    deleteBtn: "削除",
    sortHNear: "現在地から近い順",
    sortHDesc: "到達日時が新しい順",
    sortHAsc: "到達日時が古い順",
    sortHName: "名称昇順",
    sortHFar: "現在地から遠い順",
    sortHNameDesc: "名称降順",
    sortHCategory: "カテゴリ順（カテゴリID昇順）",
    noSpotsInRange: "範囲内に対象なし",
    spotDetected: "探知反応あり",
    emptyHistory: "このキーワードでの到達実績はまだありません。",
    emptyAllHistory: "到達したスポットはまだありません。",
    discoveryCompleted: "DISCOVERY COMPLETED",
    toastRecorded: (name) => `マップに「${name}」が記録されました`,
    toastCopied: (name) => `「${name}」をコピーしました`,
    targetMeta: (k, r) => `[対象: ${k || '未設定'} / 範囲: ${r}]`,
    targetMetaPinpoint: (name) => `[ピンポイント探索: ${name}]`,
    arrivalCount: (c) => `到達数: ${c} 箇所`,
    arrivalDate: (d, dist) => `到達: ${d}${dist ? ' • 約' + dist : ''}`,
    targetKeywordLabel: (k) => `対象キーワード: ${k}`,
    radarOn: "レーダーON",
    radarOff: "レーダーOFF",
    copyBtn: "コピー",
    galleryHeader: "スポット地図",
    loadingAddress: "住所情報を照会中...",
    noAddress: "住所情報なし",
    minimapBadge: "位置マップ",
    pwaTitle: "Sensor Challenge",
    pwaDesc: "「Sensor Challenge（センサーチャレンジ）」をしっかり楽しみたい方は、ホーム画面への追加（全画面アプリ起動）をおこなってください。",
    pwaStep1: "ブラウザ下部の「共有（四角と矢印）」をタップ",
    pwaStep2: "メニューから「ホーム画面に追加」を選択",
    pwaStep3: "ホーム画面に生成されたアイコンから起動",
    pwaSkip: "ブラウザのままテスト起動（記録は一時的になります）",
    safetyTitle: "安全にお楽しみいただくために",
    safetyDesc: "「Sensor Challenge（センサーチャレンジ）」をプレイする際は、交通ルールを遵守し、周囲の安全に十分注意しながらお楽しみください。",
    safetyOk: "OK",
    compassAllow: "方位を許可 · タップ",
    compassDenied: "方位の許可なし · タップして再確認",
    compassUnavailable: "方位を取得できません · タップして再確認",
    compassCalibrate: "方位を調整中 · スマホをゆっくり動かしてください",
    compassReady: (h) => `コンパス ${h}°`,
    compassLowAccuracy: (h) => `コンパス ${h}° · 精度低下`,
    compassMoving: (h) => `移動方向 ${h}°`,
    confirmCleanZero: (n) => `到達数0件の履歴（${n}件）をすべて削除しますか？`,
    confirmDeleteKeyword: (k) => `キーワード「${k}」の履歴と到達データをすべて削除しますか？`,
    confirmDeleteSingle: (name) => `「${name}」の到達履歴を削除しますか？`,
    noZeroKeywords: "削除対象となる到達0件の履歴はありません。",
    confirmEndSearch: "探索を終了しますか？"
  },
  en: {
    inputPlaceholder: "Enter search keyword...",
    btnSet: "SET",
    unvisited: "Left:",
    detecting: " detected",
    detectingLocked: " detected · 1 target locked",
    locationInfoMissing: "Location information unavailable",
    compassInfoMissing: "Compass information unavailable",
    sensorInfoMissing: "Location and compass information unavailable",
    standby: "STANDBY",
    searching: "SEARCHING...",
    paused: "PAUSED",
    sensorActive: "SENSOR: ACTIVE",
    sensorPaused: "SENSOR: PAUSED",
    sensorStandby: "SENSOR: STANDBY",
    soundModeHeadphone: "for HEADPHONE",
    soundModeSpeaker: "for SPEAKER",
    soundModeMuted: "MUTED",
    soundModeHeadphoneDesc: "Headphone mode: Music and detection sounds can play together. Use headphones when Silent Mode is on.",
    soundModeSpeakerDesc: "Speaker mode: Detection sounds play even in Silent Mode. Music or other audio may stop. If you cannot hear any sound, first switch back to Speaker mode. If that does not help, try reopening or restarting the app.",
    soundModeMutedDesc: "Sound off: Detection sounds will not play.",
    wakeLockOn: "KEEP SCREEN ON",
    wakeLockOff: "KEEP SCREEN OFF",
    wakeLockOnDesc: "Keep screen on: Prevents the screen from turning off automatically while in use.",
    wakeLockOffDesc: "Keep screen off: Allows the screen to turn off according to your device settings.",
    pulseRateDescriptions: {
      max: "Pulse rate: MAX · Default intervals",
      mid: "Pulse rate: MID · 2× default intervals",
      low: "Pulse rate: LOW · 4× default intervals"
    },
    langSwitchLabel: "→JA",
    footerTip: "Visual ring pulses even in mute mode",
    keywordsTitle: "Search History",
    filterKeywordsPlaceholder: "Filter keywords...",
    filterHistoryPlaceholder: "Filter places...",
    sortSearch: "By Search Date",
    sortArrival: "By Discovery Date",
    sortCount: "By Discovery Count",
    cleanZeroBtn: "Delete Zero-Hit Records",
    deleteCurrentKeyBtn: "Delete This Keyword's History",
    backToKeywords: "◀History",
    backToHistory: "◀Places",
    spotDetailTitle: "Spot Detail",
    allHistoryTitle: "Compendium",
    deleteBtn: "Delete",
    sortHNear: "By Distance (Nearest)",
    sortHDesc: "Newest First",
    sortHAsc: "Oldest First",
    sortHName: "Name ascending",
    sortHFar: "Farthest first",
    sortHNameDesc: "Name descending",
    sortHCategory: "Category ID ascending",
    noSpotsInRange: "No targets in range",
    spotDetected: "Target detected",
    emptyHistory: "No places discovered for this keyword yet.",
    emptyAllHistory: "No places discovered yet.",
    discoveryCompleted: "DISCOVERY COMPLETED",
    toastRecorded: (name) => `Recorded "${name}" to slate map`,
    toastCopied: (name) => `Copied "${name}"`,
    targetMeta: (k, r) => `[Target: ${k || 'None'} / Range: ${r}]`,
    targetMetaPinpoint: (name) => `[Pinpoint Target: ${name}]`,
    arrivalCount: (c) => `Discovered: ${c} spots`,
    arrivalDate: (d, dist) => `Date: ${d}${dist ? ' • ~' + dist : ''}`,
    targetKeywordLabel: (k) => `Target Keyword: ${k}`,
    radarOn: "RADAR ON",
    radarOff: "RADAR OFF",
    copyBtn: "COPY",
    galleryHeader: "Spot map",
    loadingAddress: "Querying address...",
    noAddress: "No address available",
    minimapBadge: "Location Map",
    pwaTitle: "Sensor Challenge",
    pwaDesc: "To fully enjoy 'Sensor Challenge', please add this app to your Home Screen for full-screen startup.",
    pwaStep1: "Tap 'Share' icon in the browser toolbar",
    pwaStep2: "Select 'Add to Home Screen'",
    pwaStep3: "Open from your Home Screen icon",
    pwaSkip: "Continue in browser for testing (Data will be temporary)",
    safetyTitle: "For Safe Enjoyment",
    safetyDesc: "When playing 'Sensor Challenge', please obey traffic rules and pay close attention to your surroundings.",
    safetyOk: "OK",
    compassAllow: "Enable compass · Tap",
    compassDenied: "Compass permission denied · Tap to retry",
    compassUnavailable: "Compass unavailable · Tap to retry",
    compassCalibrate: "Calibrating compass · Move phone slowly",
    compassReady: (h) => `Compass ${h}°`,
    compassLowAccuracy: (h) => `Compass ${h}° · Low accuracy`,
    compassMoving: (h) => `Travel direction ${h}°`,
    confirmCleanZero: (n) => `Delete all ${n} keywords with 0 discoveries?`,
    confirmDeleteKeyword: (k) => `Delete keyword "${k}" and its recorded places?`,
    confirmDeleteSingle: (name) => `Delete discovery record for "${name}"?`,
    noZeroKeywords: "No zero-discovery keywords found.",
    confirmEndSearch: "End the current search?"
  }
};

let currentLang = localStorage.getItem('sheikah_lang');
if (!currentLang) {
  const userSysLang = (navigator.language || '').toLowerCase();
  currentLang = userSysLang.startsWith('ja') ? 'ja' : 'en';
}

let currentMapStyleMode = localStorage.getItem('sheikah_map_style') || 'botw';
let markersList = [];

function clearAllMarkers() {
  markersList.forEach(marker => marker.remove());
  markersList = [];
}

function redrawMarkersWithFade() {
  if (!map) return;
  clearAllMarkers();
  const db = loadSavedData();
  const sortedArrivals = [...(db.arrivals || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  sortedArrivals.slice(0, 10).forEach((item, index) => {
    markersList.push(map.addMarker(arrivalPinPosition(item), currentMapStyleMode === 'botw',
      Math.max(0.15, 1.0 - index * 0.09), item.name));
  });
  updateDestinationOutlines();
}

function arrivalPinPosition(item) {
  const pin = item.arrivalPosition;
  return pin && Number.isFinite(pin.lat) && Number.isFinite(pin.lng) &&
    Math.abs(pin.lat) <= 90 && Math.abs(pin.lng) <= 180 ? pin : item;
}

let savedOutlineSignature = null;
let savedOutlineGeneration = 0;
let savedOutlineMap = null;
let savedOutlinePlaces = [];

function updateDestinationOutlines(db = loadSavedData()) {
  if (!map) return;
  const saved = [...(db.arrivals || [])]
    .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  if (window.SensorAppStorage) {
    const signature = JSON.stringify(saved.map(({ id, date }) => [id, date]));
    if (signature === savedOutlineSignature && map === savedOutlineMap) {
      map.setOutlines(savedOutlinePlaces);
      return;
    }
    savedOutlineSignature = signature;
    savedOutlineMap = map;
    const currentMap = map;
    const generation = ++savedOutlineGeneration;
    Promise.all(saved.map(loadSpotDetails)).then(places => {
      if (generation !== savedOutlineGeneration || map !== currentMap) return;
      savedOutlinePlaces = places.filter(place => validDestinationGeometry(place.geometry));
      map.setOutlines(savedOutlinePlaces);
    }).catch(() => { savedOutlineSignature = null; });
    return;
  }
  const areas = new Map();
  saved.forEach(place => {
    if (validDestinationGeometry(place.geometry)) areas.set(place.id, place);
  });
  map.setOutlines([...areas.values()]);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function applyLanguage(lang) {
  currentLang = lang;
  if (window.SensorRewardAds) {
    window.SensorRewardAds.language = () => currentLang;
    window.SensorRewardAds.refreshLanguage();
  }
  localStorage.setItem('sheikah_lang', lang);
  const t = I18N[lang];

  document.getElementById('keyword-input').placeholder = t.inputPlaceholder;
  if (!appState.isTracking) {
    document.getElementById('set-btn').textContent = t.btnSet;
  }
  document.getElementById('label-unvisited').textContent = t.unvisited;
  document.getElementById('label-detecting').textContent = t.detecting;
  document.getElementById('label-footer-tip').textContent = t.footerTip;
  document.getElementById('title-page-keywords').textContent = t.keywordsTitle;
  document.getElementById('keyword-filter').placeholder = t.filterKeywordsPlaceholder;
  document.getElementById('history-filter').placeholder = t.filterHistoryPlaceholder;
  document.getElementById('opt-sort-search').textContent = t.sortSearch;
  document.getElementById('opt-sort-arrival').textContent = t.sortArrival;
  document.getElementById('opt-sort-count').textContent = t.sortCount;
  document.getElementById('btn-delete-zero-keywords').textContent = t.cleanZeroBtn;
  document.getElementById('btn-delete-current-keyword').textContent = t.deleteCurrentKeyBtn;
  document.getElementById('back-to-keywords').textContent = t.backToKeywords;
  document.getElementById('back-to-history-list').textContent = t.backToHistory;
  document.getElementById('detail-header-title').textContent = t.spotDetailTitle;
  document.getElementById('all-header-title').textContent = t.allHistoryTitle;
  document.getElementById('detail-btn-copy').textContent = t.copyBtn;
  document.getElementById('detail-btn-delete-single').textContent = t.deleteBtn;
  document.getElementById('detail-gallery-header').textContent = t.galleryHeader;
  document.getElementById('opt-hsort-near').textContent = t.sortHNear;
  document.getElementById('opt-hsort-desc').textContent = t.sortHDesc;
  document.getElementById('opt-hsort-asc').textContent = t.sortHAsc;
  document.getElementById('opt-hsort-name').textContent = t.sortHName;
  document.getElementById('opt-hsort-far').textContent = t.sortHFar;
  document.getElementById('opt-hsort-name-desc').textContent = t.sortHNameDesc;
  document.getElementById('opt-hsort-category').textContent = t.sortHCategory;
  document.getElementById('opt-asort-near').textContent = t.sortHNear;
  document.getElementById('opt-asort-desc').textContent = t.sortHDesc;
  document.getElementById('opt-asort-asc').textContent = t.sortHAsc;
  document.getElementById('opt-asort-name').textContent = t.sortHName;
  document.getElementById('opt-asort-far').textContent = t.sortHFar;
  document.getElementById('opt-asort-name-desc').textContent = t.sortHNameDesc;
  document.getElementById('opt-asort-category').textContent = t.sortHCategory;
  document.getElementById('toast-title').textContent = t.discoveryCompleted;
  document.getElementById('label-lang-switch').textContent = t.langSwitchLabel;

  const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const japanese = lang === 'ja';
  const labels = japanese ? {
    title: 'ホーム画面に本アプリを追加してからご利用ください', desc: '本アプリは、ホーム画面から起動して利用することを想定しています。',
    first: appleMobile ? '「共有」をタップ' : 'ブラウザのメニューを開く',
    menu: appleMobile ? '共有' : 'メニュー', second: 'ホーム画面に追加',
    step2: appleMobile ? '「ホーム画面に追加」を選ぶ' : '「ホーム画面に追加」または「インストール」を選ぶ',
    third: appleMobile ? '追加' : '追加 / インストール', step3: '確認画面で確定して完了',
    launch: '次回から、このアイコンで起動', skip: 'ブラウザで続ける',
    note: appleMobile ? '項目が見つからない場合は、メニューを下へスクロールしてください。アプリ内で開いている場合は、Webブラウザで開き直してください。' : 'メニューの位置や項目名はWebブラウザによって異なります。アプリ内で開いている場合は、Webブラウザで開き直してください。'
  } : {
    title: 'Please add this app to your Home Screen before using it', desc: 'This app is designed to be launched and used from your Home Screen.',
    first: appleMobile ? 'Tap Share' : 'Open the browser menu',
    menu: appleMobile ? 'Share' : 'Menu', second: 'Add to Home Screen',
    step2: appleMobile ? 'Choose Add to Home Screen' : 'Choose Add to Home Screen or Install',
    third: appleMobile ? 'Add' : 'Add / Install', step3: 'Confirm to finish',
    launch: 'Next time, launch from this icon', skip: 'Continue in browser',
    note: appleMobile ? 'Scroll down the menu if needed. If you are viewing this in an in-app browser, reopen it in a web browser.' : 'Menu placement and labels vary by web browser. If you are viewing this in an in-app browser, reopen it in a web browser.'
  };
  for (const [id, value] of Object.entries({
    'pwa-browser-help-title': japanese ? 'SNSアプリ等から直接開いた方へ' : 'Opened directly from a social media or other app?',
    'pwa-browser-help-text': japanese ? 'SNSアプリ等から直接開いた場合は、ホーム画面に追加できないことがあります。アプリのメニューから「ブラウザで開く」を選び、通常のWebブラウザで開き直してください。' : 'When opened directly from a social media or other app, this page may not support adding to your Home Screen. Choose Open in browser from the app menu to reopen it in a regular web browser.',
    'pwa-browser-example-label': japanese ? '操作例：アプリのメニューを開き、下の項目を選びます。' : 'Example: open the app menu and choose the item shown below.',
    'pwa-browser-visual': japanese ? 'ブラウザで開く' : 'Open in browser',
    'pwa-browser-context-copy': japanese ? '▧　リンクをコピー' : '▧　Copy Link',
    'pwa-browser-help-fallback': japanese ? '項目がない場合は、リンクをコピーしてWebブラウザのアドレス欄に貼り付けてください。' : 'If that option is missing, copy the link and paste it into your web browser’s address bar.',
    'pwa-example-note': japanese ? '以下は操作例の図です。お使いのWebブラウザのボタン・メニューを操作してください。' : 'These are example illustrations. Use the buttons and menus in your own web browser.',
    'pwa-context-bookmark': japanese ? '♧　ブックマークに追加' : '♧　Add Bookmark',
    'pwa-context-copy': japanese ? '▧　リンクをコピー' : '▧　Copy Link',
    'pwa-context-edit': japanese ? '☷　アクションを編集' : '☷　Edit Actions',
    'pwa-home-caption-intro': japanese ? 'ホーム画面の例：このアイコンから起動します' : 'Example Home Screen: launch from this icon.',
    'pwa-home-caption-done': japanese ? '追加完了後のホーム画面の例' : 'Example Home Screen after adding the app.',
    'pwa-prompt-title': labels.title, 'pwa-prompt-desc': labels.desc,
    'pwa-step-1': labels.first, 'pwa-step-2': labels.step2, 'pwa-step-3': labels.step3,
    'pwa-visual-1': labels.menu, 'pwa-visual-2': labels.second,
    'pwa-launch-label': labels.launch, 'pwa-platform-note': labels.note, 'btn-pwa-skip': labels.skip
  })) document.getElementById(id).textContent = value;
  document.querySelectorAll('.pwa-home-picture').forEach(image => {
    image.alt = japanese ? '架空のホーム画面にSensor Challengeのアイコンが配置された例' : 'Example Home Screen with the Sensor Challenge app icon.';
  });
  for (const id of ['pwa-context-bookmark', 'pwa-context-copy', 'pwa-context-edit']) {
    document.getElementById(id).style.visibility = appleMobile ? 'visible' : 'hidden';
  }
  document.getElementById('pwa-share-picture').style.display = appleMobile ? '' : 'none';
  document.getElementById('pwa-menu-picture').style.display = appleMobile ? 'none' : 'block';
  document.querySelector('#pwa-prompt-overlay .pwa-step-card').setAttribute('aria-label', japanese ? 'ホーム画面への追加手順' : 'Home Screen installation steps');
  document.getElementById('pwa-lang-label').textContent = t.langSwitchLabel;

  document.getElementById('safety-prompt-title').textContent = t.safetyTitle;
  document.getElementById('safety-prompt-desc').textContent = t.safetyDesc + (currentLang === 'ja'
    ? '\n開始時に位置情報と動作・方向へのアクセスを求めます。地図と探知を使うには、位置情報を許可してください。'
    : '\nStarting requests location and motion/orientation access. Allow location to use the map and detection.');
  const safetyOkButton = document.getElementById('btn-safety-ok');
  safetyOkButton.textContent = safetyOkButton.disabled
    ? startupRefreshText(lang).button
    : t.safetyOk;
  renderLocationAccess();
  document.getElementById('safety-lang-label').textContent = t.langSwitchLabel;
  if (startupRefreshPending) showStartupRefresh();
  updateCompassStatus();
  updateDetectionLabel();

  updateButtonStateUI();
  renderKeywordsList();
  if (appState.selectedKeywordForHistory) renderHistoryList();
  renderAllHistoryList();
  renderChallenges();
  if (appState.selectedChallengeForHistory) renderChallengeArrivals();
}

document.getElementById('pwa-lang-btn').addEventListener('click', () => {
  applyLanguage(currentLang === 'ja' ? 'en' : 'ja');
});

document.getElementById('rewarded-access-lang-btn').addEventListener('click', () => {
  applyLanguage(currentLang === 'ja' ? 'en' : 'ja');
});

let safetyClickCount = 0;
let safetyResetTimer = null;

function setupDataTransferEasterEgg() {
  const safetyBtn = document.getElementById('safety-lang-btn');
  if (!safetyBtn) return;
  safetyBtn.addEventListener('click', () => {
    applyLanguage(currentLang === 'ja' ? 'en' : 'ja');
    safetyClickCount++;
    if (safetyResetTimer) clearTimeout(safetyResetTimer);

    if (safetyClickCount >= 6) {
      safetyClickCount = 0;
      triggerDataTransferPrompt();
      return;
    }

    safetyResetTimer = setTimeout(() => {
      safetyClickCount = 0;
    }, 2500);
  });
}

function encodeTransferData(json) {
  const bytes = new TextEncoder().encode(json);
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}

function decodeTransferData(code) {
  const bytes = Uint8Array.from(atob(code), char => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function isValidTransferData(db) {
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string');
  // Imported objects must not introduce inherited keyword entries.
  const safeKeys = value => !value || typeof value !== 'object' ||
    Object.keys(value).every(key => !['__proto__', 'constructor', 'prototype'].includes(key) && safeKeys(value[key]));
  if (!record(db) || !Array.isArray(db.arrivals) || !safeKeys(db)) return false;
  if (db.keywordHistory !== undefined && (!record(db.keywordHistory) ||
      !Object.values(db.keywordHistory).every(entry => record(entry) &&
        ['lastSearch', 'lastArrival'].every(key => entry[key] == null || typeof entry[key] === 'string')))) return false;
  if (db.completedChallenges !== undefined && !strings(db.completedChallenges)) return false;
  return db.arrivals.every(item => record(item) &&
    (typeof item.id === 'string' || (typeof item.id === 'number' && Number.isFinite(item.id))) &&
    typeof item.name === 'string' && Number.isFinite(item.lat) && Math.abs(item.lat) <= 90 &&
    Number.isFinite(item.lng) && Math.abs(item.lng) <= 180 &&
    ['keyword', 'date', 'branch', 'brand', 'formatted_address', 'phone', 'website'].every(key =>
      item[key] == null || typeof item[key] === 'string') &&
    ['keywords', 'challengeIds'].every(key => item[key] === undefined || strings(item[key])) &&
    (item.muted === undefined || typeof item.muted === 'boolean') &&
    (item.arrivalPosition == null || (record(item.arrivalPosition) &&
      Number.isFinite(item.arrivalPosition.lat) && Math.abs(item.arrivalPosition.lat) <= 90 &&
      Number.isFinite(item.arrivalPosition.lng) && Math.abs(item.arrivalPosition.lng) <= 180)) &&
    (item.geometry == null || validDestinationGeometry(item.geometry)));
}

async function triggerDataTransferPrompt() {
  const db = window.SensorAppStorage ? await window.SensorAppStorage.exportData() : loadSavedData();
  const jsonStr = JSON.stringify(db);
  const base64Code = encodeTransferData(jsonStr);

  const choice = prompt(
    "【Data Transfer】\n" +
    "1: 引き継ぎコードを発行\n" +
    "2: 引き継ぎコードを読み込む\n" +
    "半角数字「1」または「2」を入力してください:",
    "1"
  );

  if (choice === "1") {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(base64Code).then(() => {
        alert("引き継ぎコードをコピーしました！");
      }).catch(() => {
        prompt("引き継ぎコード:", base64Code);
      });
    } else {
      prompt("引き継ぎコード:", base64Code);
    }
  } else if (choice === "2") {
    const inputCode = prompt("コードを貼り付けてください:");
    if (inputCode && inputCode.trim()) {
      try {
        const restoredJson = decodeTransferData(inputCode.trim());
        const restoredDb = JSON.parse(restoredJson);
        if (isValidTransferData(restoredDb)) {
          await saveAppData(normalizeHistoryData(restoredDb), { replace: true });
          stopSearchAndReset();
          applyFeatureAccess();
          renderChallenges();
          renderKeywordsList();
          alert("復元完了しました！");
        } else {
          alert("無効なコードです。");
        }
      } catch (e) {
        alert("コード解析に失敗しました。");
      }
    }
  }
}

document.getElementById('lang-toggle-btn').addEventListener('click', () => {
  applyLanguage(currentLang === 'ja' ? 'en' : 'ja');
});

const mapContrastBtn = document.getElementById('map-style-toggle-btn');
const svgMapContrast = document.getElementById('svg-map-contrast');

function updateMapStyleUI() {
  const isDay = (currentMapStyleMode === 'botw');
  const container = document.getElementById('app-container');
  const pointerPath = document.getElementById('pointer-path');

  const roadPathD = "M 0 26 Q 16 23 20 18 T 36 10";

  if (isDay) {
    container.classList.add('day-mode');
    pointerPath.setAttribute('fill', '#ffee33');

    svgMapContrast.innerHTML = `
      <circle cx="18" cy="18" r="18" fill="#081018" />
      <path d="M 0 0 L 22 0 Q 14 12 0 16 Z" fill="#02070d" />
      <path d="${roadPathD}" stroke="#142433" stroke-width="4.5" stroke-linecap="round" fill="none" />
      <path d="M18 13 L14 23 L18 20.8 L22 23 Z" fill="#00f3ff" />
    `;
  } else {
    container.classList.remove('day-mode');
    pointerPath.setAttribute('fill', '#00f3ff');

    svgMapContrast.innerHTML = `
      <circle cx="18" cy="18" r="18" fill="#453820" />
      <path d="M 0 0 L 22 0 Q 14 12 0 16 Z" fill="#38485c" />
      <path d="${roadPathD}" stroke="#e4d5a8" stroke-width="4.5" stroke-linecap="round" fill="none" />
      <path d="M18 13 L14 23 L18 20.8 L22 23 Z" fill="#ffee33" />
    `;
  }

  redrawMarkersWithFade();
}

mapContrastBtn.addEventListener('click', () => {
  currentMapStyleMode = (currentMapStyleMode === 'sheikah') ? 'botw' : 'sheikah';
  localStorage.setItem('sheikah_map_style', currentMapStyleMode);
  if (map) {
    map.setStyle(currentMapStyleMode);
  }
  if (detailMinimapInstance) detailMinimapInstance.setStyle(currentMapStyleMode);
  updateMapStyleUI();
});

let audioCtx = null;
let silentAudioElement = null;
let audioRecoveryTimer = null;

function resetAudioOutput() {
  clearTimeout(audioRecoveryTimer);
  stopSelectedSounds();
  if (silentAudioElement) {
    silentAudioElement.pause();
    silentAudioElement = null;
  }
  const previous = audioCtx;
  audioCtx = null;
  if (previous?.soundOutputLimiter) previous.soundOutputLimiter.disconnect();
  if (previous && previous.state !== 'closed') {
    try { previous.close().catch(() => {}); } catch (_) {}
  }
  // Release the old playback route before requesting it again.
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'transient';
  } catch (_) {}
}

function recoverAudioOutput(reset = false) {
  clearTimeout(audioRecoveryTimer);
  if (document.hidden || appState.soundMode === 'muted') return;
  if (reset) resetAudioOutput();
  initAudio();
  const context = audioCtx;
  if (!context) return;
  const startTime = context.currentTime;
  // Some browsers report running while their audio clock has stopped.
  // Retry once only; a later tap can unlock autoplay-restricted playback.
  audioRecoveryTimer = setTimeout(() => {
    if (document.hidden || appState.soundMode === 'muted' || audioCtx !== context) return;
    if (context.state !== 'running' || context.currentTime <= startTime) {
      resetAudioOutput();
      initAudio();
    }
  }, 700);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(audioRecoveryTimer);
  } else if (audioCtx || silentAudioElement) {
    recoverAudioOutput(appState.soundMode === 'speaker');
  }
});
window.addEventListener('pageshow', event => {
  if (event.persisted && (audioCtx || silentAudioElement)) {
    recoverAudioOutput(appState.soundMode === 'speaker');
  }
});
// Keep a user-gesture retry available after an interruption or autoplay denial.
window.addEventListener('pointerdown', () => {
  if (audioCtx && audioCtx.state !== 'running' && !document.hidden) recoverAudioOutput();
});

function initAudio() {
  appState.isMuted = appState.soundMode === 'muted';

  // MUTEDでは音声系を起動しない。
  // playback状態から切り替わった場合もtransientへ戻す。
  if (appState.isMuted) {
    resetAudioOutput();
    if (navigator.audioSession) {
      navigator.audioSession.type = 'transient';
    }
    return;
  }

  // HEADPHONE = transient
  // SPEAKER   = playback
  if (navigator.audioSession) {
    navigator.audioSession.type =
      appState.soundMode === 'speaker' ? 'playback' : 'transient';
  }

  if (!silentAudioElement) {
    silentAudioElement = new Audio();
    silentAudioElement.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    silentAudioElement.loop = true;
  }

  try {
    silentAudioElement.play().catch(() => {});
  } catch (e) {}

  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
    audioCtx.resume().catch(() => {});
  }

  try {
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
  } catch (e) {}
}

function startCompassListening() {
  window.addEventListener('deviceorientationabsolute', onDeviceOrientation, true);
  window.addEventListener('deviceorientation', onDeviceOrientation, true);
}

async function requestCompassPermissionIfNeeded() {
  if (startupRefreshPending) return;
  if (compassPermissionPending) return;
  if (compassActive) {
    startCompassListening();
    updateCompassStatus();
    return;
  }
  compassPermissionPending = true;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      // Invoke synchronously from the user's tap, before awaiting wake lock,
      // audio or any other operation that may consume transient activation.
      const permission = await DeviceOrientationEvent.requestPermission();
      appState.compassPermission = permission;
      if (permission !== 'granted') return;
    } else {
      appState.compassPermission = 'granted';
    }
    startCompassListening();
    compassActive = true;
  } catch (e) {
    appState.compassPermission = 'error';
    console.warn("コンパス権限エラー:", e);
  } finally {
    compassPermissionPending = false;
    updateCompassStatus();
  }
}

function updateCompassStatus() {
  const button = document.getElementById('compass-status-btn');
  if (!button) return;
  button.hidden = !COMPASS_DEBUG_ENABLED;
  if (button.hidden) return;
  const t = I18N[currentLang];
  const now = Date.now();
  let text;
  let available = false;
  if (appState.isWalking) {
    text = t.compassMoving(Math.round(appState.currentHeading) % 360);
    available = true;
  } else if (appState.compassPermission === 'denied') {
    text = t.compassDenied;
  } else if (appState.compassPermission === 'prompt' || appState.compassPermission === 'error') {
    text = t.compassAllow;
  } else if (appState.compassNeedsCalibration) {
    text = t.compassCalibrate;
  } else if (appState.lastCompassTimestamp !== null &&
      now - appState.lastCompassTimestamp <= 2500) {
    const heading = Math.round(appState.currentHeading) % 360;
    const lowAccuracy = Number.isFinite(appState.compassAccuracy) && appState.compassAccuracy > 25;
    text = lowAccuracy ? t.compassLowAccuracy(heading) : t.compassReady(heading);
    available = true;
  } else {
    text = t.compassUnavailable;
  }
  if (button.textContent !== text) button.textContent = text;
  button.dataset.available = String(available);
}

window.addEventListener('touchstart', () => { 
  initAudio(); 
}, { once: true });

window.addEventListener('click', () => { 
  initAudio(); 
}, { once: true });

function playBeep(freq = 1800, duration = 0.12) {
  if (appState.isMuted) return;
  if (!audioCtx) initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') audioCtx.resume().catch(() => {});

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.05, audioCtx.currentTime + duration * 0.7);

    const peak = 0.7 * getSoundVolumeGain();
    gain.gain.setValueAtTime(peak, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(getSoundOutput(audioCtx));
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

// Quadratic audio taper: finer control at low levels, 3x the former maximum
// signal gain. Perceived loudness still depends on the device and OS volume.
function getSoundVolumeGain(volume = appState.soundVolume) {
  const level = Math.max(0, Math.min(10, volume)) / 10;
  return (30 / 7) * level * level;
}

function getSoundOutput(context) {
  if (!context.soundOutputLimiter) {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    limiter.connect(context.destination);
    context.soundOutputLimiter = limiter;
  }
  return context.soundOutputLimiter;
}

function playDoubleBeep() {
  if (appState.isMuted) return;
  playBeep(2300, 0.07);
  setTimeout(() => {
    playBeep(2450, 0.07);
  }, 85);
}

// Adopted from sound lab: R02-N / R01-N / R03-N, A31-T2 and A33-K.
const selectedSoundVoices = new Set();

function stopSelectedSounds(kind = null) {
  for (const voice of selectedSoundVoices) {
    if (!kind || voice.kind === kind) voice.dispose();
  }
}

function playSelectedSound(kind, render) {
  if (appState.isMuted) return;
  try {
    if (!audioCtx) initAudio();
    if (!audioCtx || audioCtx.state === 'closed') return;
    if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') audioCtx.resume().catch(() => {});
    const ctx = audioCtx;
    const voice = {kind, nodes:new Set(), oscillators:new Set(), timer:null, disposed:false};
    voice.dispose = () => {
      if (voice.disposed) return;
      voice.disposed = true;
      clearTimeout(voice.timer);
      for (const oscillator of voice.oscillators) {
        oscillator.onended = null;
        try { oscillator.stop(); } catch (_) {}
      }
      for (const node of voice.nodes) { try { node.disconnect(); } catch (_) {} }
      voice.nodes.clear(); voice.oscillators.clear(); selectedSoundVoices.delete(voice);
    };
    selectedSoundVoices.add(voice);
    try {
      const track = node => { voice.nodes.add(node); return node; };
      const output = track(ctx.createGain()), bus = track(ctx.createGain());
      voice.output = output;
      output.gain.value = getSoundVolumeGain();
      bus.connect(output); output.connect(getSoundOutput(ctx));
      let echoTail = 0;
      const echo = level => {
        echoTail = (level === 2 ? .18 : .105) * 5;
        for (let i = 1; i <= 5; i++) {
          const delay = track(ctx.createDelay(2)), gain = track(ctx.createGain());
          const filter = track(ctx.createBiquadFilter());
          delay.delayTime.value = (level === 2 ? .18 : .105) * i;
          gain.gain.value = (level === 2 ? .38 : .22) ** i;
          filter.type = 'lowpass'; filter.frequency.value = 4800 - i * 500;
          bus.connect(delay); delay.connect(filter); filter.connect(gain); gain.connect(output);
        }
      };
      const tone = (frequency, time, duration, amplitude = .3, type = 'sine', endFrequency, attack = .008) => {
        const oscillator = track(ctx.createOscillator()), gain = track(ctx.createGain());
        voice.oscillators.add(oscillator);
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, time);
        if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration * .7);
        gain.gain.setValueAtTime(.0001, time);
        gain.gain.exponentialRampToValueAtTime(amplitude, time + attack);
        gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
        oscillator.connect(gain); gain.connect(bus);
        oscillator.onended = () => {
          if (voice.disposed) return;
          oscillator.disconnect(); gain.disconnect();
          voice.nodes.delete(oscillator); voice.nodes.delete(gain); voice.oscillators.delete(oscillator);
          if (!voice.oscillators.size) voice.timer = setTimeout(voice.dispose, echoTail * 1000 + 30);
        };
        oscillator.start(time); oscillator.stop(time + duration);
      };
      const mallet = (time, frequency, duration, amplitude = .25) => {
        tone(frequency, time, duration, amplitude);
        tone(frequency * 3, time, duration * .24, amplitude * .2);
      };
      // Radar pulses share their start with the visual wave; arrival previews used a 25ms lead.
      render({tone, mallet, echo, start:ctx.currentTime + (kind === 'radar' ? 0 : .025)});
      if (!voice.oscillators.size) voice.dispose();
      return voice;
    } catch (_) { voice.dispose(); }
  } catch (_) { /* An unavailable audio device must not interrupt exploration or recording. */ }
}

function playRadarSonar(stage, echoLevel = 2) {
  return playSelectedSound('radar', ({tone, echo, start}) => {
    echo(echoLevel);
    const deep = stage === 'normal';
    const frequency = deep ? 440 : 660, end = deep ? 470 : 720;
    const attack = stage === 'near' ? .025 : .04;
    tone(frequency, start, .35, .34, 'sine', end, attack);
    if (stage === 'close') {
      tone(frequency * 1.006, start, .35 * 1.1, .065, 'sine', end * 1.006, attack);
      tone(frequency * 2, start, .35 * .65, .035, 'sine', end * 2, attack);
    }
  });
}

function playSelectedFanfare(challenge) {
  return playSelectedSound('presentation', ({tone, mallet, echo, start}) => {
    echo(1);
    const notes = challenge
      ? [55,60,64,67,72,67,64,60,62,65,69,74,76,74,71,72]
      : [60,67,64,72,67,76,72,67,65,69,74,72,67,64,67,72];
    notes.forEach((note, index) => {
      const frequency = 440 * 2 ** ((note - 69) / 12), time = start + index * .115;
      const duration = index === notes.length - 1 ? (challenge ? .8 : .6) : .18;
      if (challenge) tone(frequency, time, duration, .25, 'triangle');
      else mallet(time, frequency, duration);
    });
  });
}

function playChallengePlaceCue() {
  return playSelectedSound('presentation', ({tone, echo, start}) => {
    echo(1);
    tone(440 * 2 ** ((76 - 69) / 12), start, .14, .05, 'triangle', null, .012);
    tone(440 * 2 ** ((79 - 69) / 12), start + .075, .13, .045, 'triangle', null, .012);
  });
}

function playTreasureFanfare() {
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 300, 100, 600]);
  return playSelectedFanfare(false);
}

const CHALLENGE_GROUPS = [
  { id: 'gourmet', ja: 'グルメ', en: 'Gourmet', categories: [
    'catering.restaurant', 'catering.cafe', 'catering.fast_food',
    'catering.food_court', 'catering.ice_cream', 'commercial.food_and_drink.bakery',
    'commercial.food_and_drink.deli', 'commercial.food_and_drink.confectionery', 'commercial.food_and_drink.chocolate',
    'commercial.food_and_drink.ice_cream', 'commercial.food_and_drink.coffee_and_tea', 'commercial.food_and_drink.fruit_and_vegetable',
    'commercial.food_and_drink.seafood', 'commercial.food_and_drink.butcher', 'commercial.food_and_drink.cheese_and_dairy',
    'commercial.food_and_drink.organic', 'commercial.food_and_drink.rice', 'commercial.food_and_drink.honey',
    'commercial.food_and_drink.nuts', 'commercial.food_and_drink.spices', 'commercial.food_and_drink.pasta',
    'commercial.food_and_drink.frozen_food', 'commercial.food_and_drink.health_food', 'commercial.food_and_drink.farm'
  ] },
  { id: 'life', ja: 'ライフ', en: 'Life', categories: [
    'commercial.supermarket', 'commercial.convenience', 'commercial.marketplace',
    'commercial.shopping_mall', 'commercial.department_store', 'commercial.discount_store',
    'commercial.books', 'commercial.stationery', 'commercial.clothing',
    'commercial.bag', 'commercial.baby_goods', 'commercial.houseware_and_hardware',
    'commercial.florist', 'commercial.furniture_and_interior', 'commercial.chemist',
    'commercial.health_and_beauty', 'commercial.toy_and_game', 'commercial.pet',
    'commercial.elektronics', 'commercial.second_hand', 'commercial.kiosk',
    'public_transport.train', 'public_transport.light_rail', 'public_transport.monorail',
    'public_transport.subway', 'public_transport.tram', 'public_transport.bus',
    'public_transport.ferry', 'tourism.sights.city_hall', 'leisure.park',
    'education.library', 'healthcare.pharmacy', 'healthcare.hospital',
    'healthcare.clinic_or_praxis', 'healthcare.dentist', 'service.post.office',
    'service.financial.bank', 'service.financial.atm', 'service.cleaning',
    'service.beauty.hairdresser',
    // Broad daily services include repairs, beauty, postal facilities and utilities.
    'service', 'commercial.agrarian', 'commercial.antiques', 'commercial.art',
    'commercial.energy', 'commercial.garden', 'commercial.gas',
    'commercial.gift_and_souvenir', 'commercial.hobby', 'commercial.jewelry',
    'commercial.newsagent', 'commercial.outdoor_and_sport', 'commercial.trade',
    'commercial.vehicle', 'commercial.video_and_music', 'commercial.watches', 'commercial.wedding',
    'education', 'childcare', 'healthcare', 'pet', 'rental', 'parking',
    'activity.community_center', 'activity.events_venue',
    'office.government', 'office.insurance', 'office.water_utility',
    'office.telecommunication', 'office.energy_supplier', 'office.estate_agent',
    'office.employment_agency', 'office.accountant', 'office.lawyer',
    'office.notary', 'office.tax_advisor', 'office.financial', 'office.financial_advisor',
    'office.charity', 'office.non_profit', 'office.association', 'office.travel_agent',
    'office.educational_institution', 'airport',
    'leisure.playground', 'leisure.picnic', 'leisure.spa', 'sport.fitness',
    'amenity', 'emergency.defibrillator', 'emergency.phone', 'emergency.first_aid',
    'emergency.disaster_help_point', 'emergency.assembly_point', 'emergency.drinking_water'
  ] },
  { id: 'leisure', ja: 'レジャー', en: 'Leisure', categories: [
    'entertainment', 'beach', 'leisure.park',
    'leisure.playground', 'leisure.picnic.picnic_site', 'leisure.picnic.bbq',
    'leisure.spa.public_bath', 'camping.camp_site', 'camping.summer_camp',
    'camping.caravan_site', 'sport.stadium', 'sport.skateboard',
    'sport.golf_course', 'sport.dojo', 'sport.horse_riding',
    'sport.ice_rink', 'sport.pitch', 'sport.sports_centre',
    'sport.sports_hall', 'sport.swimming_pool', 'sport.track',
    'sport.fitness', 'tourism.attraction.viewpoint', 'national_park',
    'sport.fishing', 'sport.dive_centre', 'ski', 'maritime.marina',
    'tourism.information.office', 'accommodation', 'public_transport.aerialway'
  ] },
  { id: 'deep', ja: 'ディープ', en: 'Deep', categories: [
    'tourism.sights.castle', 'tourism.sights.ruines', 'tourism.sights.archaeological_site',
    'tourism.sights.place_of_worship', 'tourism.sights.monastery', 'tourism.sights.lighthouse',
    'tourism.sights.windmill', 'tourism.sights.tower', 'tourism.sights.battlefield',
    'tourism.sights.fort', 'tourism.sights.building', 'tourism.sights.manor',
    'tourism.sights.city_gate', 'tourism.sights.bridge', 'tourism.sights.square',
    'tourism.sights.memorial.monument', 'tourism.sights.memorial.boundary_stone', 'tourism.sights.memorial.milestone',
    'tourism.sights.memorial.tumulus', 'religion.place_of_worship', 'heritage',
    'tourism.attraction.artwork', 'tourism.attraction.fountain', 'tourism.attraction.clock',
    'tourism.sights.memorial', 'man_made', 'tourism.information.map', 'tourism.information.ranger_station'
  ] },
  { id: 'secret', ja: 'シークレット', en: 'Secret', categories: [] }
];

function challengeCategoriesForGroup(groupId) {
  return [...new Set(CHALLENGE_GROUPS.filter(group => groupId === 'secret' || group.id === groupId)
    .flatMap(group => group.categories))];
}

const CHALLENGE_STAGES = [
  { id: 'nearest1', radius: 1000, mode: 'nearest' },
  { id: 'random1', radius: 1000, mode: 'random' },
  { id: 'random3', radius: 3000, mode: 'random' }
];
const CHALLENGES = CHALLENGE_STAGES.flatMap(stage => CHALLENGE_GROUPS.map(group => ({
  ...stage, id: `${stage.id}-${group.id}`, stage: stage.id, group: group.id, sensor: 'standard'
})));

function challengeProgress(db = loadSavedData()) {
  const completed = new Set((Array.isArray(db.completedChallenges) ? db.completedChallenges : [])
    .filter(id => CHALLENGES.some(challenge => challenge.id === id)));
  const count = stage => CHALLENGES.filter(c => c.stage === stage && completed.has(c.id)).length;
  const nearest = count('nearest1'), random = count('random1'), wide = count('random3');
  return { completed, nearest, random, wide, target: random >= 1, sensor: random >= 5,
    maxRadius: completed.size === CHALLENGES.length ? 100000 : wide >= 3 ? 50000 : wide >= 1 ? 10000 : 3000 };
}

function isChallengeAvailable(challenge, progress = challengeProgress()) {
  return challenge.stage === 'nearest1' ||
    (challenge.stage === 'random1' ? progress.nearest >= 3 : progress.nearest >= 3 && progress.random >= 3);
}

function challengeName(challenge) {
  const group = CHALLENGE_GROUPS.find(g => g.id === challenge.group);
  return currentLang === 'ja'
    ? `${group.ja}${challenge.radius / 1000}km${challenge.mode === 'nearest' ? '最寄り' : 'ランダム'}`
    : `${group.en} ${challenge.radius / 1000}km ${challenge.mode === 'nearest' ? 'Nearest' : 'Random'}`;
}

const RADIUS_OPTIONS = [200, 1000, 3000, 10000, 50000, 100000];
let savedRadiusIdx = parseInt(localStorage.getItem('sheikah_last_radius_idx') || '2', 10);
let radiusIndex = isNaN(savedRadiusIdx) ? 2 : Math.max(0, Math.min(savedRadiusIdx, RADIUS_OPTIONS.length - 1));
if (radiusIndex !== savedRadiusIdx) {
  localStorage.setItem('sheikah_last_radius_idx', radiusIndex.toString());
}

let lastKnownPos = { lat: 35.681236, lng: 139.767125 };
try {
  const cached = localStorage.getItem('sheikah_last_pos');
  if (cached) lastKnownPos = JSON.parse(cached);
} catch(e) {}

const SOUND_MODES = ['headphone', 'speaker', 'muted'];
let savedSoundMode = localStorage.getItem('sheikah_sound_mode') || 'headphone';
if (!SOUND_MODES.includes(savedSoundMode)) {
  savedSoundMode = 'headphone';
}

let savedSoundVolume = Number(localStorage.getItem('sheikah_sound_volume') || '7');
if (!Number.isFinite(savedSoundVolume) || savedSoundVolume < 0.5 || savedSoundVolume > 10 || !Number.isInteger(savedSoundVolume * 2)) {
  savedSoundVolume = 7;
}

let savedWakeLockActive = localStorage.getItem('sheikah_wake_lock');
if (savedWakeLockActive === null) {
  savedWakeLockActive = true;
} else {
  savedWakeLockActive = savedWakeLockActive === 'true';
}

let appState = {
  explorationId: null,
  explorationStartedAt: 0,
  explorationPhase: "waiting",
  accessCommitPending: false,
  isTracking: false,
  isPaused: false,
  soundMode: savedSoundMode,
  isMuted: savedSoundMode === 'muted',
  wakeLockActive: savedWakeLockActive,
  soundVolume: savedSoundVolume,
  pulseRate: readSensorSetting("pulse_rate", ["max", "mid", "low"], "max"),
  targetMode: challengeProgress().target ? readSensorSetting("target_mode", ["random", "nearest", "all"], "nearest") : "nearest",
  sensorDetail: challengeProgress().sensor ? readSensorSetting("sensor_detail", ["standard", "detailed"], "standard") : "standard",
  activeChallenge: null,
  selectedChallengeForHistory: null,
  challengeSettings: null,
  challengeCategories: null,
  currentPos: null,
  lastSearchedPos: null,

  currentHeading: 0,
  visualMapRotation: 0,
  lastCompassHeading: null,

  locationHistory: [],
  isWalking: false,
  lastWalkTimestamp: 0,
  lastMovementHeadingTimestamp: null,
  movementCandidate: null,
  stopCandidate: null,
  filteredCompassHeading: null,
  lastCompassTimestamp: null,
  compassJumpCandidate: null,
  lastAbsoluteCompassTimestamp: null,
  compassSource: null,
  compassPermission: 'prompt',
  compassNeedsCalibration: false,
  compassAccuracy: null,

  activeKeyword: "",
  selectedKeywordForHistory: null,
  selectedSpotForDetail: null,
  fromAllHistory: false,
  fromChallenge: false,
  places: [],
  randomTarget: null,
  pinpointTarget: null
};

let wakeLockSentinel = null;
let watchId = null;
let locationAccessRequested = false;
let locationAccessState = 'idle';
let locationWatchGeneration = 0;
let lastLocationFixTime = 0;
let compassActive = false;
let compassPermissionPending = false;

let isSearchInProgress = false;
let searchGeneration = 0;
let initialSearchAccessGranted = false;
let arrivalInProgressId = null;
let detailMinimapInstance = null;

function loadSavedData() {
  if (window.SensorAppStorage) return normalizeHistoryData(window.SensorAppStorage.read());
  const data = localStorage.getItem('sheikah_db_v1');
  if (data) return normalizeHistoryData(JSON.parse(data));
  return { keywordHistory: {}, arrivals: [] };
}

function normalizeHistoryData(db) {
  db.keywordHistory ||= {};
  db.arrivals ||= [];
  const legacyChallenges = new Map();
  for (const challenge of CHALLENGES) {
    const group = CHALLENGE_GROUPS.find(g => g.id === challenge.group);
    legacyChallenges.set(`${group.ja}${challenge.radius / 1000}km${challenge.mode === 'nearest' ? '最寄り' : 'ランダム'}`, challenge.id);
    legacyChallenges.set(`${group.en} ${challenge.radius / 1000}km ${challenge.mode === 'nearest' ? 'Nearest' : 'Random'}`, challenge.id);
  }
  for (const item of db.arrivals) {
    if (!Array.isArray(item.keywords)) {
      const legacyId = legacyChallenges.get(item.keyword);
      item.keywords = item.keyword && !legacyId ? [item.keyword] : [];
      if (legacyId) item.challengeIds = [...new Set([...(item.challengeIds || []), legacyId])];
    }
    item.keyword = item.keywords[0] || '';
  }
  for (const name of legacyChallenges.keys()) delete db.keywordHistory[name];
  return db;
}

function recordArrivalAssociation(db, item, keyword, challenge, now) {
  item.keywords ||= item.keyword ? [item.keyword] : [];
  if (challenge) {
    db.completedChallenges = [...new Set([...(db.completedChallenges || []), challenge.id])];
    item.challengeIds = [...new Set([...(item.challengeIds || []), challenge.id])];
  } else if (keyword) {
    item.keywords = [...new Set([...item.keywords, keyword])];
    db.keywordHistory[keyword] ||= { lastSearch: now };
    db.keywordHistory[keyword].lastArrival = now;
  }
  item.keyword = item.keywords[0] || '';
}

function deleteKeywordHistory(db, keyword) {
  delete db.keywordHistory[keyword];
  db.arrivals = db.arrivals.filter(item => {
    const associated = item.keywords.includes(keyword);
    item.keywords = item.keywords.filter(key => key !== keyword);
    item.keyword = item.keywords[0] || '';
    return !associated || item.keywords.length > 0 || (item.challengeIds || []).length > 0;
  });
}

function saveAppData(db, options) {
  if (window.SensorAppStorage) {
    const saved = window.SensorAppStorage.save(db, options);
    // Storage reports errors separately; event handlers must not leak rejections.
    saved.catch(() => {});
    return saved;
  }
  localStorage.setItem('sheikah_db_v1', JSON.stringify(db));
  return Promise.resolve();
}

async function loadSpotDetails(item) {
  if (!window.SensorAppStorage) return item;
  return await window.SensorAppStorage.detail(item.id) || item;
}


let map = null;
let visualMapCenter = null;
let mapCenterTarget = null;
let mapCenterFrame = null;
let lastMapPositionFix = null;
let mapPositionJump = null;
let mapCenterIsMoving = false;
let mapCenterMotion = null;

function initMap(lat, lng) {
  if (typeof maplibregl === 'undefined' || typeof SensorMap === 'undefined') {
    document.getElementById('map-load-status').hidden = false;
    return;
  }
  const centerPos = { lat, lng };
  if (!map) {
    try {
      map = SensorMap.createMap('map', centerPos, currentMapStyleMode,
        document.getElementById('map-load-status'));
      redrawMarkersWithFade();
    } catch (error) {
      document.getElementById('map-load-status').hidden = false;
      console.warn('OSM map initialization failed:', error);
      return;
    }
  } else {
    map.setCenter(centerPos);
  }
  visualMapCenter = { ...centerPos };
  mapCenterTarget = { ...centerPos };
}

function updateMapPositionSmoothly(coords, now) {
  if (typeof traceLocation === 'function') traceLocation('updateMapPositionSmoothly', '', 2000);
  if (!map) return;
  const position = { lat: coords.latitude, lng: coords.longitude };
  if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return;
  const accuracy = Number.isFinite(coords.accuracy) ? Math.max(0, coords.accuracy) : 10;
  // Coarse fixes can still keep the map useful during transport. Only the
  // display uses this tolerance; arrival calculations retain the measured fix.
  if (accuracy > 1000) {
    if (typeof traceLocation === 'function') traceLocation('map.fix.rejected', 'accuracy > 1000m', 2000);
    mapPositionJump = null;
    mapCenterMotion = null;
    return;
  }
  if (!lastMapPositionFix) {
    visualMapCenter = { ...position };
    mapCenterTarget = { ...position };
    lastMapPositionFix = { ...position, accuracy, time: now };
    map.setCenter(position);
    return;
  }

  const speed = coords.speed;
  const moving = appState.isWalking || (Number.isFinite(speed) && speed > 0.4) ||
    (!Number.isFinite(speed) && lastMapPositionFix.speed > 0.4);
  mapCenterIsMoving = moving;
  // A reported stop or rejected fix must immediately end prediction.
  mapCenterMotion = null;
  const distance = getDistance(mapCenterTarget.lat, mapCenterTarget.lng, position.lat, position.lng);
  const deadZone = Math.max(1.5, Math.min(8, accuracy * 0.35));
  if (!moving && distance <= deadZone) {
    mapPositionJump = null;
    lastMapPositionFix = { ...position, accuracy, time: now };
    return;
  }

  const elapsed = Math.max(0, (now - lastMapPositionFix.time) / 1000);
  const expectedTravel = Number.isFinite(speed) ? Math.max(0, speed) * elapsed :
    Math.max(moving ? 2 : 0, Math.min(120, lastMapPositionFix.speed || 0)) * elapsed;
  const jumpThreshold = Math.max(15, accuracy + lastMapPositionFix.accuracy + expectedTravel * 3);
  if (distance > jumpThreshold) {
    const candidate = mapPositionJump;
    // Two consecutive fixes need not be at the same spot: trains can travel
    // well beyond ten metres between fixes, and Safari may omit speed.
    const candidateElapsed = candidate ? Math.max(0, (now - candidate.time) / 1000) : 0;
    const confirmationRadius = Math.max(10, accuracy + lastMapPositionFix.accuracy,
      Math.min(5, candidateElapsed) * 120);
    if (!candidate || now - candidate.time > 5000 ||
        getDistance(candidate.lat, candidate.lng, position.lat, position.lng) > confirmationRadius) {
      if (typeof traceLocation === 'function') traceLocation('map.fix.pending', 'waiting for jump confirmation', 2000);
      mapPositionJump = { ...position, time: now };
      return;
    }
    if (now - candidate.time < 300) return;
  }
  mapPositionJump = null;
  const previousFix = lastMapPositionFix;
  const measuredDistance = getDistance(previousFix.lat, previousFix.lng, position.lat, position.lng);
  const inferredSpeed = elapsed > 0 ? measuredDistance / elapsed : 0;
  const travelSpeed = Number.isFinite(speed) ? Math.max(0, speed) : inferredSpeed;
  const heading = Number.isFinite(coords.heading) ? coords.heading :
    (measuredDistance > Math.max(3, accuracy * 0.5) ?
      getBearing(previousFix.lat, previousFix.lng, position.lat, position.lng) : null);
  // Predict only fast travel with recent, credible fixes. Walking retains its
  // noise filtering; prediction never changes the measured application position.
  if (accuracy <= 50 && travelSpeed >= 5 && travelSpeed <= 120 && heading !== null && elapsed > 0 && elapsed <= 5) {
    mapCenterMotion = {
      speed: travelSpeed, heading, startedAt: performance.now(),
      horizon: Math.max(1, Math.min(3, elapsed * 1.5))
    };
  }
  lastMapPositionFix = { ...position, accuracy, time: now, speed: Math.min(120, travelSpeed) };
  mapCenterTarget = position;
  if (mapCenterFrame !== null) return;

  let lastFrameTime = null;
  function animateCenter(timestamp) {
    const elapsed = lastFrameTime === null ? 16 : Math.min(64, timestamp - lastFrameTime);
    lastFrameTime = timestamp;
    let target = mapCenterTarget;
    let predicting = false;
    if (mapCenterMotion) {
      const age = Math.max(0, (timestamp - mapCenterMotion.startedAt) / 1000);
      const horizon = mapCenterMotion.horizon;
      // Ease velocity to zero over the last second if GPS updates stop.
      const cruise = horizon - 1;
      const taper = Math.max(0, Math.min(1, age - cruise));
      const travelTime = Math.min(age, cruise) + taper - taper * taper / 2;
      const angularDistance = mapCenterMotion.speed * travelTime / 6371000;
      const bearing = mapCenterMotion.heading * Math.PI / 180;
      const latitude = mapCenterTarget.lat * Math.PI / 180;
      const projectedLatitude = Math.asin(Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing));
      target = {
        lat: projectedLatitude * 180 / Math.PI,
        lng: ((mapCenterTarget.lng + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) *
          Math.cos(latitude), Math.cos(angularDistance) - Math.sin(latitude) *
          Math.sin(projectedLatitude)) * 180 / Math.PI + 540) % 360) - 180
      };
      predicting = age < horizon;
    }
    const distance = getDistance(visualMapCenter.lat, visualMapCenter.lng, target.lat, target.lng);
    if (distance <= 0.1 && !predicting) {
      visualMapCenter = { ...target };
      mapCenterFrame = null;
    } else {
      const amount = 1 - Math.exp(-elapsed / (mapCenterIsMoving ? 250 : 650));
      visualMapCenter.lat += (target.lat - visualMapCenter.lat) * amount;
      visualMapCenter.lng = ((visualMapCenter.lng +
        headingDelta(target.lng, visualMapCenter.lng) * amount + 540) % 360) - 180;
      mapCenterFrame = requestAnimationFrame(animateCenter);
    }
    map.setCenter(visualMapCenter);
  }
  mapCenterFrame = requestAnimationFrame(animateCenter);
}

function bootstrapMapAndLocation() {
  traceLocation('bootstrapMapAndLocation');
  initMap(lastKnownPos.lat, lastKnownPos.lng);
  updateMapStyleUI();

  // Permission requests start from a tap on the startup or search controls.
}

function renderLocationAccess() {
  const notice = document.getElementById('location-access-notice');
  const message = document.getElementById('location-access-message');
  const retry = document.getElementById('location-access-retry');
  notice.hidden = locationAccessState === 'idle' || locationAccessState === 'ready';
  retry.hidden = locationAccessState === 'waiting' || notice.hidden || locationAccessState === 'unsupported';
  retry.textContent = currentLang === 'ja' ? '位置情報を再取得' : 'Retry location';
  const messages = currentLang === 'ja' ? {
    waiting: '位置情報を取得中です。許可の確認が出たら「許可」を選んでください。',
    denied: '位置情報へのアクセスが拒否されました。Safariのページメニューで、このサイトの「位置情報」を「許可」にしてから再取得してください。',
    error: '位置情報を取得できませんでした。通信や位置情報の設定を確認して、再取得してください。',
    insecure: '位置情報を使うには、このサイトをHTTPSで開いてください。',
    unsupported: 'このブラウザでは位置情報を利用できません。Safariで開いてください。'
  } : {
    waiting: 'Getting your location. Choose Allow if permission is requested.',
    denied: 'Location access was denied. In Safari’s page menu, set Location for this site to Allow, then retry.',
    error: 'Location unavailable. Check connectivity and location settings, then retry.',
    insecure: 'Open this site over HTTPS to use location.',
    unsupported: 'Location is unavailable in this browser. Open the site in Safari.'
  };
  message.textContent = messages[locationAccessState] || '';
}

function requestLocationAccess() {
  if (startupRefreshPending) return;
  traceLocation('requestLocationAccess');
  locationAccessRequested = true;
  const generation = ++locationWatchGeneration;
  if (watchId !== null && 'geolocation' in navigator) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (window.isSecureContext === false || !('geolocation' in navigator)) {
    locationAccessState = window.isSecureContext === false ? 'insecure' : 'unsupported';
    renderLocationAccess();
    return;
  }
  locationAccessState = 'waiting';
  appState.currentPos = null;
  renderLocationAccess();
  traceLocation('gps.watch.start');
  watchId = navigator.geolocation.watchPosition(
    position => {
      if (generation !== locationWatchGeneration) return;
      locationAccessState = 'ready';
      lastLocationFixTime = Date.now();
      renderLocationAccess();
      onPositionUpdate(position);
    },
    error => {
      if (generation !== locationWatchGeneration) return;
      traceLocation('gps.error', `code=${error.code} ${error.message}`);
      locationAccessState = error.code === 1 ? 'denied' : 'error';
      if (error.code === 1) {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
        appState.currentPos = null;
      }
      renderLocationAccess();
      evaluateSensorCycle();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
}


function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

let radarTimer = null;
let scheduledInterval = null;

function updateVisualRing(level) {
  const ring = document.getElementById('circle-map-wrapper');
  if (!ring) return;
  ring.className = `circle-map-wrapper signal-${level}`;
}

function resetKeywordSearch() {
  searchGeneration++;
  initialSearchAccessGranted = false;
  isSearchInProgress = false;
  arrivalInProgressId = null;
  appState.randomTarget = null;
  appState.places = [];
  appState.lastSearchedPos = null;
}

function readSensorSetting(key, modes, fallback) {
  const value = localStorage.getItem(`sheikah_${key}`);
  return modes.includes(value) ? value : fallback;
}

// Only the destination's own area is used; containing buildings may host other places.
function validDestinationGeometry(geometry) {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return Array.isArray(polygons) && polygons.length > 0 && polygons.every(polygon =>
    Array.isArray(polygon) && polygon.length > 0 && polygon.every(ring =>
      Array.isArray(ring) && ring.length >= 4 && ring.every(point =>
        Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
        Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90) &&
      ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]));
}

function destinationGeometryReading(position, target) {
  if (!validDestinationGeometry(target.geometry)) return null;
  const polygons = target.geometry.type === 'Polygon' ? [target.geometry.coordinates] : target.geometry.coordinates;
  const scale = Math.PI / 180 * 6371000;
  const project = point => [
    ((point[0] - position.lng + 540) % 360 - 180) * scale * Math.cos(position.lat * Math.PI / 180),
    (point[1] - position.lat) * scale
  ];
  let nearest = Infinity;
  let boundary = null;
  let insideArea = false;
  for (const polygon of polygons) {
    const insideRings = polygon.map(ring => {
      let inside = false;
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = project(ring[i - 1]);
        const [bx, by] = project(ring[i]);
        if ((ay > 0) !== (by > 0) && 0 < ax + (bx - ax) * -ay / (by - ay)) inside = !inside;
        const dx = bx - ax, dy = by - ay;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
        const distance = Math.hypot(ax + t * dx, ay + t * dy);
        if (distance < nearest) {
          nearest = distance;
          const start = ring[i - 1], end = ring[i];
          const longitudeDelta = (end[0] - start[0] + 540) % 360 - 180;
          boundary = { lat: start[1] + t * (end[1] - start[1]),
            lng: (start[0] + t * longitudeDelta + 540) % 360 - 180 };
        }
      }
      return inside;
    });
    if (insideRings[0] && !insideRings.slice(1).some(Boolean)) insideArea = true;
  }
  return { distance: insideArea ? 0 : nearest, boundary };
}

function destinationDistance(position, target) {
  return destinationGeometryReading(position, target)?.distance ??
    getDistance(position.lat, position.lng, target.lat, target.lng);
}

function geoapifyPlaceIdentity(properties, fallbackName = '') {
  const raw = properties.datasource?.raw || {};
  const text = value => typeof value === 'string' ? value.trim() : '';
  let name = text(properties.name_international?.[currentLang]) || text(raw[`name:${currentLang}`])
    || text(properties.name) || text(raw.name) || fallbackName;
  const branch = text(properties.branch) || text(raw.branch);
  const brand = text(properties.brand) || text(raw.brand);
  const normalized = value => value.normalize('NFKC').replace(/\s/g, '').toLowerCase();
  if (!branch && fallbackName && normalized(fallbackName).includes(normalized(name)) && fallbackName.length > name.length) name = fallbackName;
  const fullName = branch && !normalized(name).includes(normalized(branch)) ? `${name} ${branch}` : name;
  return { name: fullName, branch, brand };
}

function applyDestinationDetails(place, metadata) {
  if (!metadata) return;
  const identity = geoapifyPlaceIdentity(metadata, place.name);
  if (place.placeDetailsVersion === 1 && place.name === identity.name && place.branch === identity.branch && place.brand === identity.brand) return;
  Object.assign(place, identity);
  place.placeDetailsVersion = 1;
  if (typeof loadSavedData === 'function' && typeof saveAppData === 'function') {
    const db = loadSavedData();
    const saved = db.arrivals.find(item => item.id === place.id);
    if (saved) {
      Object.assign(saved, { name: place.name, branch: place.branch, brand: place.brand, placeDetailsVersion: 1 });
      saveAppData(db);
    }
  }
  if (typeof document !== 'undefined') {
    if (appState.selectedSpotForDetail?.id === place.id) {
      Object.assign(appState.selectedSpotForDetail, identity);
      document.getElementById('detail-spot-name').textContent = place.name;
    }
    // Update every already-rendered list without changing its order or scroll position.
    for (const row of document.querySelectorAll?.('.list-item[data-spot-id]') || []) {
      if (row.dataset.spotId === place.id) row.querySelector('.list-item-title').textContent = place.name;
    }
  }
}

function requestDestinationGeometry(target) {
  if (typeof fetchGeoapify !== 'function' || typeof target.id !== 'string' || target.id.startsWith('geo:')) return;
  const state = requestDestinationGeometry.state ||= { cache: new Map(), queue: [], running: 0 };
  // Evict completed details only: queued requests must keep their shared entry.
  for (const [id, cached] of state.cache) {
    if (cached.done && (Date.now() >= cached.expires || state.cache.size >= 64)) state.cache.delete(id);
  }
  const cacheId = `${currentLang}:${target.id}`;
  let entry = state.cache.get(cacheId);
  if (entry?.done && Date.now() >= entry.expires) {
    state.cache.delete(cacheId);
    entry = null;
  }
  if (!entry) {
    entry = { targets: new Set(), geometry: null, metadata: null, done: false };
    state.cache.set(cacheId, entry);
    state.queue.push({ id: target.id, language: currentLang, entry });
  }
  if (entry.done) {
    if (entry.geometry) target.geometry = entry.geometry;
    applyDestinationDetails(target, entry.metadata);
    return;
  }
  entry.targets.add(target);
  while (state.running < 4 && state.queue.length) {
    const task = state.queue.shift();
    state.running++;
    fetchGeoapify('/v2/place-details', { id: task.id, features: 'details', lang: task.language })
      .then(features => {
        const details = features.find(feature => feature.properties?.feature_type === 'details');
        if (validDestinationGeometry(details?.geometry)) task.entry.geometry = details.geometry;
        task.entry.metadata = details?.properties || null;
        task.entry.expires = features.cacheExpires || Date.now() + 5 * 24 * 60 * 60 * 1000;
      })
      .catch(() => { task.entry.failed = true; task.entry.expires = Date.now() + 60 * 1000; })
      .finally(() => {
        task.entry.done = true;
        for (const place of task.entry.targets) {
          if (task.entry.geometry) place.geometry = task.entry.geometry;
          applyDestinationDetails(place, task.entry.metadata);
        }
        task.entry.targets.clear();
        state.running--;
        if (state.queue.length) requestDestinationGeometry({ id: state.queue[0].id });
        if (appState.isTracking && !appState.isPaused) evaluateSensorCycle();
        globalThis.SensorExplorationRecovery?.checkpoint();
      });
  }
}

function getSearchCandidates(db = loadSavedData()) {
  if (!appState.currentPos) return [];
  const radius = RADIUS_OPTIONS[radiusIndex];
  const mutedIds = new Set(db.arrivals.filter(item => item.muted).map(item => item.id));
  return appState.places.filter(place => !mutedIds.has(place.id) &&
    destinationDistance(appState.currentPos, place) <= radius);
}

function refreshOutOfRangeTargets(previousPos, db = loadSavedData()) {
  if (!appState.isTracking || appState.isPaused || appState.pinpointTarget ||
      !appState.currentPos || !appState.lastSearchedPos || isSearchInProgress) return;
  const radius = RADIUS_OPTIONS[radiusIndex];
  const target = appState.randomTarget;
  const outside = target && destinationDistance(appState.currentPos, target) > radius;
  // All-target mode refreshes once the last eligible candidate leaves the radius.
  const exhausted = appState.targetMode === 'all' && previousPos && !getSearchCandidates(db).length &&
    appState.places.some(place => destinationDistance(previousPos, place) <= radius &&
      !db.arrivals.some(item => item.id === place.id && item.muted));
  if (!outside && !exhausted) return;
  appState.randomTarget = null;
  appState.places = [];
  executeSearch(true);
}

function chooseSearchTarget(origin = appState.lastSearchedPos || appState.currentPos, db = loadSavedData()) {
  const previousTarget = appState.randomTarget;
  const available = getSearchCandidates(db);
  const outsideArrivalRange = appState.activeChallenge?.mode === 'random'
    ? available.filter(place => destinationDistance(appState.currentPos, place) > 20)
    : available;
  const candidates = outsideArrivalRange.length ? outsideArrivalRange : available;
  appState.randomTargetArrivalFallback = !outsideArrivalRange.length;
  // Retain the selection position so late-arriving area details cannot award
  // a spot that was already within arrival range when an alternative existed.
  appState.randomTargetOrigin = appState.currentPos ? { ...appState.currentPos } : null;
  if (appState.targetMode === 'all' || !candidates.length) {
    appState.randomTarget = null;
  } else if (appState.targetMode === 'nearest') {
    appState.randomTarget = candidates.reduce((nearest, place) =>
      getDistance(origin.lat, origin.lng, place.lat, place.lng) <
      getDistance(origin.lat, origin.lng, nearest.lat, nearest.lng) ? place : nearest);
  } else {
    appState.randomTarget = candidates[Math.floor(Math.random() * candidates.length)];
  }
  if (previousTarget !== appState.randomTarget) globalThis.SensorExplorationRecovery?.checkpoint();
}

function maintainSearchTarget(db = loadSavedData()) {
  if (appState.targetMode === 'all') {
    appState.randomTarget = null;
    return;
  }
  if (!appState.randomTarget || !getSearchCandidates(db).some(place => place.id === appState.randomTarget.id) ||
      (appState.activeChallenge?.mode === 'random' && !appState.randomTargetArrivalFallback && appState.randomTargetOrigin &&
        destinationDistance(appState.randomTargetOrigin, appState.randomTarget) <= 20)) {
    chooseSearchTarget(undefined, db);
  }
}

const SENSOR_INFO_NOTICE_DELAY = 20000;
let sensorInfoMonitoringSince = null;

function sensorInfoNotice(now = Date.now()) {
  if (sensorInfoMonitoringSince === null || document.visibilityState === 'hidden') return '';
  // Start/resume gets a full grace period; old readings never shorten it.
  const locationMissing = now - Math.max(sensorInfoMonitoringSince, lastLocationFixTime) >= SENSOR_INFO_NOTICE_DELAY;
  const compassMissing = now - Math.max(sensorInfoMonitoringSince, appState.lastCompassTimestamp ?? 0) >= SENSOR_INFO_NOTICE_DELAY;
  const t = I18N[currentLang];
  return locationMissing && compassMissing ? t.sensorInfoMissing :
    locationMissing ? t.locationInfoMissing : compassMissing ? t.compassInfoMissing : '';
}

function sensorReaction(distance, angle) {
  if (appState.sensorDetail === 'standard' && !appState.isWalking) {
    return { level: 'idle', interval: null, double: false };
  }
  const radius = RADIUS_OPTIONS[radiusIndex];
  const strong = Math.max(100, radius * 0.1);
  const medium = Math.max(150, radius * 0.3);
  let band = 0;
  let progress = 0;
  if (angle >= 90) return { level: 'idle', interval: null, double: false };
  if (distance <= 50 && angle <= 20) {
    band = 4;
    progress = (50 - distance) / 30;
  } else if ((distance <= strong && angle <= 35) || (distance <= 50 && angle <= 55)) {
    band = 3;
    progress = (strong - distance) / (strong - 50);
  } else if (distance <= medium && angle <= 55) {
    band = 2;
    progress = (medium - distance) / (medium - strong);
  } else if (angle < 85) {
    band = 1;
    progress = (radius - distance) / (radius - medium);
  }
  if (!band) return { level: 'idle', interval: null, double: false };
  const enhanced = appState.sensorDetail === 'detailed' && progress >= 0.5;
  const intervals = [null, 2600, 1500, 800, 450];
  const intermediateIntervals = [null, 2050, 1150, 625, 350];
  return {
    level: `level${band}${enhanced ? '-half' : ''}`,
    interval: enhanced ? intermediateIntervals[band] : intervals[band],
    double: band === 4
  };
}

function updateDetectionLabel() {
  const label = document.getElementById('label-detecting');
  if (!label) return;
  const notice = sensorInfoNotice();
  for (const id of ['label-unvisited', 'unknown-count']) {
    const element = document.getElementById(id);
    if (element) element.hidden = Boolean(notice);
  }
  const locked = appState.isTracking && !appState.isPaused &&
    appState.targetMode !== 'all' && Boolean(appState.pinpointTarget || appState.randomTarget);
  label.textContent = notice || (locked ? I18N[currentLang].detectingLocked : I18N[currentLang].detecting);
}

function evaluateSensorCycle() {
  updateStoppedState(Date.now());
  globalThis.SensorRuntimeDiagnostics?.count('sensor.cycle');
  if (arrivalInProgressId !== null || appState.accessCommitPending) return;
  const db = window.SensorAppStorage
    ? { arrivals: window.SensorAppStorage.detection() } : loadSavedData();
  updateDetectionLabel();
  const countEl = document.getElementById('unknown-count');
  const distInfoEl = document.getElementById('distance-info');
  const t = I18N[currentLang];

  if (!appState.isTracking || appState.isPaused || !appState.currentPos) {
    if (radarTimer) { clearTimeout(radarTimer); radarTimer = null; }
    scheduledInterval = null;
    updateVisualRing('idle');
    countEl.textContent = "--";
    if (appState.isPaused) distInfoEl.textContent = "--";
    return;
  }

  if (!appState.pinpointTarget) {
    refreshOutOfRangeTargets(null, db);
    maintainSearchTarget(db);
  }
  if (!appState.pinpointTarget && !appState.randomTarget && isSearchInProgress) {
    countEl.textContent = "--";
    distInfoEl.textContent = t.searching;
    if (radarTimer) { clearTimeout(radarTimer); radarTimer = null; }
    scheduledInterval = null;
    updateVisualRing('idle');
    return;
  }
  const lockedTarget = appState.pinpointTarget || appState.randomTarget;
  const activeTargets = lockedTarget ? [lockedTarget] :
    (appState.targetMode === 'all' ? getSearchCandidates(db) : []);

  // The count represents all eligible places in either locked or all-target mode.
  countEl.textContent = appState.pinpointTarget ? 1 : getSearchCandidates(db).length;
  updateDetectionLabel();

  const nearestTarget = activeTargets.reduce((nearest, place) => !nearest ||
    destinationDistance(appState.currentPos, place) < destinationDistance(appState.currentPos, nearest)
      ? place : nearest, null);
  const geometryTargets = lockedTarget ? [lockedTarget] : (nearestTarget ? [nearestTarget] : []);
  geometryTargets.forEach(requestDestinationGeometry);
  if (lockedTarget && !appState.pinpointTarget && appState.activeChallenge?.mode === 'random' && !appState.randomTargetArrivalFallback &&
      appState.randomTargetOrigin && destinationDistance(appState.randomTargetOrigin, lockedTarget) <= 20) {
    chooseSearchTarget(undefined, db);
    evaluateSensorCycle();
    return;
  }

  if (activeTargets.length === 0) {
    if (!distInfoEl.textContent.includes("API")) {
      distInfoEl.textContent = t.noSpotsInRange;
    }
    if (radarTimer) { clearTimeout(radarTimer); radarTimer = null; }
    scheduledInterval = null;
    updateVisualRing('idle');
    return;
  }

  const readings = activeTargets.map(target => {
    const distance = getDistance(appState.currentPos.lat, appState.currentPos.lng, target.lat, target.lng);
    const bearing = getBearing(appState.currentPos.lat, appState.currentPos.lng, target.lat, target.lng);
    const angle = Math.abs(headingDelta(appState.currentHeading, bearing));
    return { target, distance, ...sensorReaction(distance, angle) };
  });
  const arrival = readings.filter(reading => destinationDistance(appState.currentPos, reading.target) <= 20)
    .sort((a, b) => a.distance - b.distance)[0];
  if (arrival) {
    if (arrivalInProgressId === arrival.target.id) return;
    handleArrival(arrival.target);
    return;
  }
  // Every candidate participates; the strongest reaction drives the shared ring and sound.
  const reaction = readings.reduce((best, reading) =>
    reading.interval !== null && (best.interval === null || reading.interval < best.interval) ? reading : best);
  const { level, interval, double } = reaction;

  updateVisualRing(level);

  if (!distInfoEl.textContent.includes("API")) {
    distInfoEl.textContent = (level === 'idle') ? t.noSpotsInRange : t.spotDetected;
  }

  if (interval !== null) {
    scheduleRadarSound(interval, double);
  } else {
    if (radarTimer) { clearTimeout(radarTimer); radarTimer = null; }
    scheduledInterval = null;
  }
}

function scheduleRadarSound(interval, isDoubleBeep = false) {
  // Preserve the approved five/nine-level timing; only the repeat cycle follows pulseRate.
  const baseInterval = interval;
  const rate = { max: 1, mid: 0.5, low: 0.25 }[appState.pulseRate] || 1;
  interval = baseInterval / rate;
  if (radarTimer && scheduledInterval === interval) {
    return;
  }

  if (radarTimer) clearTimeout(radarTimer);
  scheduledInterval = interval;

  function pulse() {
    if (appState.sensorDetail === 'standard') {
      updateStoppedState(Date.now());
      if (!appState.isWalking) {
        evaluateSensorCycle();
        return;
      }
    }
    if (!appState.isTracking || appState.isPaused) {
      radarTimer = null;
      scheduledInterval = null;
      return;
    }

    playRadarSonar(isDoubleBeep ? 'close' : baseInterval <= 900 ? 'near' : 'normal');

    const wave = document.getElementById('radar-pulse');
    if (wave) {
      wave.className = 'radar-pulse-ring';
      void wave.offsetWidth;
      wave.classList.add(isDoubleBeep ? 'pulse-double-anim' : 'pulse-anim');
    }

    radarTimer = setTimeout(pulse, interval);
  }
  pulse();
}

async function handleArrival(target) {
  if (arrivalInProgressId !== null) return;
  arrivalInProgressId = target.id;
  const generation = searchGeneration;
  const challenge = appState.activeChallenge;
  appState.isPaused = true;
  if (radarTimer) { clearTimeout(radarTimer); radarTimer = null; }
  scheduledInterval = null;
  traceArrivalStage('detected');
  try {
    const db = loadSavedData();
    const completed = await updateArrivalRecordWithDetails(db, target, new Date().toISOString());
    if (!completed) { traceArrivalStage('cancelled'); return; }
    traceArrivalStage('feedback');
    // Optional feedback must never prevent recording an arrival.
    try {
      const flash = document.getElementById('arrival-flash-overlay');
      if (flash) {
        flash.classList.remove('flash-anim');
        void flash.offsetWidth;
        flash.classList.add('flash-anim');
      }
      // Challenge completion already plays its own fanfare.
      if (!challenge) playTreasureFanfare();
    } catch (_) { traceArrivalStage('feedback-error'); }
    traceArrivalStage('complete');
  } catch (_) {
    traceArrivalStage('failed');
    if (generation !== searchGeneration) return;
    // Keep exploration paused rather than repeatedly retrying a failed write.
    updateButtonStateUI();
    showToast(currentLang === 'ja' ? '到着処理を完了できませんでした。履歴を確認してください。'
      : 'Unable to complete arrival. Please check your history.');
  } finally {
    if (generation === searchGeneration && arrivalInProgressId === target.id) arrivalInProgressId = null;
  }
}

async function updateArrivalRecordWithDetails(db, target, now) {
  const generation = searchGeneration;
  const existing = db.arrivals.find(a => a.id === target.id);
  const area = appState.currentPos ? destinationGeometryReading(appState.currentPos, target) : null;
  const arrivalPosition = area?.boundary || { lat: target.lat, lng: target.lng };
  if (!existing) {
    db.arrivals.push({
      id: target.id, name: target.name, branch: target.branch || '', brand: target.brand || '',
      placeDetailsVersion: target.placeDetailsVersion || 0, keyword: '', keywords: [],
      categories: target.categories || [],
      lat: target.lat, lng: target.lng, date: now, muted: true,
      arrivalPosition, geometry: area ? target.geometry : null,
      formatted_address: target.formatted_address || '',
      phone: target.phone || null, website: target.website || null
    });
  } else {
    existing.muted = true;
    if (target.categories?.length) existing.categories = target.categories;
    if (target.name) existing.name = target.name;
    if (target.branch) existing.branch = target.branch;
    if (target.brand) existing.brand = target.brand;
    if (target.placeDetailsVersion) existing.placeDetailsVersion = target.placeDetailsVersion;
    existing.arrivalPosition = arrivalPosition;
    if (area) existing.geometry = target.geometry;
    if (target.formatted_address) existing.formatted_address = target.formatted_address;
  }

  const challenge = appState.activeChallenge;
  recordArrivalAssociation(db, db.arrivals.find(item => item.id === target.id), appState.activeKeyword, challenge, now);
  if (appState.explorationId) {
    db.completedExplorationIds = [...new Set([...(db.completedExplorationIds || []), appState.explorationId])].slice(-32);
  }
  traceArrivalStage('saving');
  await saveAppData(db);
  traceArrivalStage('saved');
  // A user may end exploration or start another search while IndexedDB commits.
  if (generation !== searchGeneration) return false;

  // Stop detection before updating map buffers or starting completion feedback.
  stopSearchAndReset();
  traceArrivalStage('map');
  redrawMarkersWithFade();

  hideOtherSettingToasts();

  if (challenge) {
    document.getElementById('keyword-input').value = '';
    checkMainInputClearState();
    renderChallenges();
    navigateToMain();
    traceArrivalStage('challenge-feedback');
    showChallengePresentation(challenge, true, target);
    return true;
  }

  traceArrivalStage('presentation');
  showChallengePresentation(null, false, target);
  return true;
}

let mapRotationFrame = null;
let mapRotationTarget = 0;
let lastCompassEvaluationTime = -Infinity;

function rotateMapSmoothly(targetBearing) {
  const mapDiv = document.getElementById('map');
  const mapRing = document.getElementById('circle-map-wrapper');
  if (!mapDiv) return;
  mapRotationTarget = -targetBearing;
  // Rotate the canvas with CSS to keep compass updates cheap on mobile devices.
  mapDiv.style.transition = 'none';
  if (mapRotationFrame !== null) return;

  let lastFrameTime = null;
  function animateRotation(timestamp) {
    const elapsed = lastFrameTime === null ? 16 : Math.min(64, timestamp - lastFrameTime);
    lastFrameTime = timestamp;
    const diff = headingDelta(mapRotationTarget, appState.visualMapRotation);
    if (Math.abs(diff) <= 0.05) {
      appState.visualMapRotation += diff;
      mapRotationFrame = null;
    } else {
      appState.visualMapRotation += diff * (1 - Math.exp(-elapsed / 100));
      mapRotationFrame = requestAnimationFrame(animateRotation);
    }
    mapDiv.style.transform = `rotate(${appState.visualMapRotation}deg)`;
    if (mapRing) mapRing.style.setProperty('--map-north-rotation', `${appState.visualMapRotation}deg`);
  }
  mapRotationFrame = requestAnimationFrame(animateRotation);
}

// Compare angles across north without treating 359° → 1° as a full turn.
function headingDelta(target, current) {
  return (((target - current + 180) % 360 + 360) % 360) - 180;
}

function enterStoppedState() {
  appState.isWalking = false;
  appState.lastMovementHeadingTimestamp = null;
  appState.movementCandidate = null;
  appState.stopCandidate = null;
  appState.locationHistory = [];
}

function updateStoppedState(now) {
  if (appState.movementCandidate && now - appState.movementCandidate.lastTime > 4000) {
    appState.movementCandidate = null;
  }
  if (appState.isWalking && now - appState.lastWalkTimestamp >= 5000) {
    enterStoppedState();
  }
}

function confirmStopped(coords, newPos, now) {
  if (!appState.isWalking) return;
  const speed = coords.speed;
  const candidate = appState.stopCandidate;
  const stillNearAnchor = candidate &&
    getDistance(candidate.pos.lat, candidate.pos.lng, newPos.lat, newPos.lng) <= 2;
  const slow = Number.isFinite(speed) ? speed <= 0.4 : stillNearAnchor;
  if (Number.isFinite(speed) && !slow) {
    appState.stopCandidate = null;
    return;
  }
  if (!candidate || !stillNearAnchor || now - candidate.lastTime > 4000) {
    appState.stopCandidate = { pos: newPos, since: now, lastTime: now };
    return;
  }
  candidate.lastTime = now;
  // Explicit low speed is stronger evidence than clustered position fixes.
  if (slow && now - candidate.since >= (Number.isFinite(speed) ? 1000 : 2500)) {
    enterStoppedState();
  }
}

function calculateSmoothedHeading(newPos, accuracy, now) {
  appState.locationHistory = appState.locationHistory.filter(p => now - p.time <= 12000);
  appState.locationHistory.push({ ...newPos, accuracy, time: now });
  const oldest = appState.locationHistory[0];
  const elapsed = (now - oldest.time) / 1000;
  if (elapsed < 2) return null;

  const moved = getDistance(oldest.lat, oldest.lng, newPos.lat, newPos.lng);
  // Require displacement beyond both fixes' uncertainty, not GPS jitter.
  if (moved < Math.max(6, oldest.accuracy + accuracy) || moved / elapsed < 0.8) return null;
  return getBearing(oldest.lat, oldest.lng, newPos.lat, newPos.lng);
}

function determineMovementHeading(coords, newPos, now) {
  updateStoppedState(now);
  const accuracy = coords.accuracy;
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 25) {
    appState.locationHistory = [];
    appState.movementCandidate = null;
    return null;
  }

  confirmStopped(coords, newPos, now);
  const inferredHeading = calculateSmoothedHeading(newPos, accuracy, now);
  const speed = coords.speed;
  const minSpeed = 0.8;
  let heading = null;
  if (Number.isFinite(speed)) {
    if (speed >= minSpeed) {
      heading = Number.isFinite(coords.heading) ? coords.heading : inferredHeading;
    } else {
      // A reported stop must not be overridden by positional drift.
      appState.locationHistory = [];
    }
  } else {
    heading = inferredHeading;
  }

  // Movement evidence does not depend on GPS supplying a direction.
  const moving = Number.isFinite(speed) ? speed >= minSpeed : inferredHeading !== null;
  if (!moving) {
    appState.movementCandidate = null;
    return null;
  }
  const movementHeading = heading;
  const compassReliable = appState.compassSource === 'absolute' &&
    !appState.compassNeedsCalibration && Number.isFinite(appState.filteredCompassHeading) &&
    Number.isFinite(appState.lastCompassTimestamp) && now - appState.lastCompassTimestamp <= 1500 &&
    (appState.compassAccuracy === null || (Number.isFinite(appState.compassAccuracy) &&
      appState.compassAccuracy >= 0 && appState.compassAccuracy <= 35));
  if (heading === null && compassReliable) heading = appState.filteredCompassHeading;
  if (heading !== null) heading = (heading % 360 + 360) % 360;
  if (!appState.isWalking) {
    const candidate = appState.movementCandidate;
    if (!candidate || now - candidate.lastTime > 4000 ||
        (heading !== null && candidate.heading !== null &&
         Math.abs(headingDelta(heading, candidate.heading)) > 45)) {
      appState.movementCandidate = { heading, since: now, lastTime: now };
      return null;
    }
    candidate.lastTime = now;
    if (now - candidate.since < 2000) return null;
    appState.isWalking = true;
  }
  appState.lastWalkTimestamp = now;
  if (movementHeading !== null) appState.lastMovementHeadingTimestamp = now;
  return heading;
}

function onDeviceOrientation(e) {
  globalThis.SensorRuntimeDiagnostics?.count('compass.event');
  const now = Date.now();
  const absolute = e.type === 'deviceorientationabsolute' || e.absolute === true ||
    Number.isFinite(e.webkitCompassHeading);
  // Relative alpha has an arbitrary origin and cannot identify geographic
  // north. Only earth-referenced events may drive the map or sensor direction.
  if (!absolute) return;

  let compassHeading = null;
  if (Number.isFinite(e.webkitCompassHeading)) {
    appState.compassAccuracy = Number.isFinite(e.webkitCompassAccuracy) ? e.webkitCompassAccuracy : null;
    if (appState.compassAccuracy !== null && appState.compassAccuracy < 0) {
      appState.compassNeedsCalibration = true;
      updateCompassStatus();
      return;
    }
    compassHeading = e.webkitCompassHeading;
  } else if (Number.isFinite(e.alpha)) {
    compassHeading = (360 - e.alpha) % 360;
  }
  if (compassHeading === null) return;
  appState.compassNeedsCalibration = false;
  if (!Number.isFinite(e.webkitCompassHeading)) appState.compassAccuracy = null;
  if (absolute) appState.lastAbsoluteCompassTimestamp = now;
  const screenAngle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
  compassHeading = (compassHeading + screenAngle + 360) % 360;
  const source = absolute ? 'absolute' : 'relative';
  const previousTime = appState.lastCompassTimestamp;
  if (appState.filteredCompassHeading === null || previousTime === null ||
      now - previousTime > 1500 || appState.compassSource !== source) {
    appState.filteredCompassHeading = compassHeading;
    appState.compassJumpCandidate = null;
  } else {
    const delta = headingDelta(compassHeading, appState.filteredCompassHeading);
    // Reject isolated large spikes but accept a confirmed turn without waiting
    // for the phone to stop turning.
    if (Math.abs(delta) > 60) {
      const jump = appState.compassJumpCandidate;
      if (!jump || now - jump.time > 300 ||
          Math.abs(headingDelta(compassHeading, jump.heading)) > 20) {
        appState.compassJumpCandidate = { heading: compassHeading, time: now };
        return;
      }
    }
    appState.compassJumpCandidate = null;
    const elapsed = Math.max(1, Math.min(250, now - previousTime));
    const timeConstant = Math.abs(delta) > 5 ? 120 : 350;
    appState.filteredCompassHeading = (appState.filteredCompassHeading +
      delta * (1 - Math.exp(-elapsed / timeConstant)) + 360) % 360;
  }
  appState.lastCompassTimestamp = now;
  appState.compassSource = source;
  appState.lastCompassHeading = appState.filteredCompassHeading;
  updateStoppedState(now);
  // Prefer the travel direction while fresh; otherwise follow a reliable compass.
  if (appState.isWalking && (appState.lastMovementHeadingTimestamp !== null &&
      now - appState.lastMovementHeadingTimestamp < 3000)) return;
  if (appState.isWalking && appState.compassAccuracy !== null &&
      appState.compassAccuracy > 35) return;
  const smoothed = appState.filteredCompassHeading;
  if (Math.abs(headingDelta(smoothed, appState.currentHeading)) < 0.6) return;
  appState.currentHeading = smoothed;
  rotateMapSmoothly(smoothed);
  // Radar and local storage work need not run at the compass event frequency.
  if (now - lastCompassEvaluationTime >= 100) {
    lastCompassEvaluationTime = now;
    evaluateSensorCycle();
  }
}

function onPositionUpdate(pos) {
  globalThis.SensorRuntimeDiagnostics?.count('gps.fix');
  traceLocation('onPositionUpdate', `accuracy=${Math.round(pos.coords.accuracy)}m`);
  const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  const previousPos = appState.currentPos;
  appState.currentPos = newPos;
  lastKnownPos = newPos;
  localStorage.setItem('sheikah_last_pos', JSON.stringify(newPos));

  if (!map) initMap(newPos.lat, newPos.lng);

  const now = Date.now();
  const determinedHeading = determineMovementHeading(pos.coords, newPos, now);
  if (determinedHeading !== null) {
    const diff = Math.abs(headingDelta(determinedHeading, appState.currentHeading));
    if (diff >= 7 || appState.currentHeading === 0) {
      appState.currentHeading = determinedHeading;
      rotateMapSmoothly(determinedHeading);
    }
  }

  updateMapPositionSmoothly(pos.coords, now);
  refreshOutOfRangeTargets(previousPos);

  if (appState.isTracking && !appState.isPaused && !appState.pinpointTarget &&
      !appState.lastSearchedPos) {
    executeSearch();
  }

  evaluateSensorCycle();
}

// Apply to challenge results, including places tagged as both restaurants and bars.
const CHALLENGE_EXCLUDED_CATEGORIES = [
  'adult', 'catering.bar', 'catering.pub', 'catering.biergarten', 'catering.taproom',
  'commercial.smoking', 'commercial.erotic', 'commercial.weapons',
  'commercial.pyrotechnics', 'commercial.tickets_and_lottery',
  'commercial.hobby.brewing', 'commercial.food_and_drink.drinks', 'service.bookmaker',
  'public_transport.platform', 'public_transport.subway.entrance'
];

function isExcludedChallengePlace(categories = [], properties = {}) {
  if (Array.isArray(categories) && categories.some(category => CHALLENGE_EXCLUDED_CATEGORIES.some(excluded =>
    category === excluded || category.startsWith(excluded + '.')))) return true;
  // Source tags can identify adult venues even when also tagged as ordinary services.
  const raw = properties.datasource?.raw || {};
  const adultTypes = new Set(['brothel', 'stripclub', 'swingerclub', 'swingers', 'erotic', 'adult']);
  return ['amenity', 'shop', 'club'].some(key => adultTypes.has(String(raw[key] || '').toLowerCase()));
}

const CATEGORY_KEYWORDS = [
  { terms: ['カフェ', '喫茶店', 'コーヒー', 'cafe', 'café', 'coffee'], category: 'catering.cafe' },
  { terms: ['レストラン', '飲食店', 'restaurant'], category: 'catering.restaurant' },
  { terms: ['コンビニ', 'コンビニエンスストア', 'convenience store'], category: 'commercial.convenience' },
  { terms: ['スーパー', 'スーパーマーケット', 'supermarket'], category: 'commercial.supermarket' },
  { terms: ['ホテル', '宿泊', 'hotel'], category: 'accommodation.hotel' },
  { terms: ['公園', 'park'], category: 'leisure.park' },
  { terms: ['薬局', 'pharmacy'], category: 'healthcare.pharmacy' },
  { terms: ['病院', 'hospital'], category: 'healthcare.hospital' },
  { terms: ['銀行', 'bank'], category: 'service.financial.bank' },
  { terms: ['駐車場', 'parking'], category: 'parking' },
  { terms: ['観光', '観光名所', 'sights'], category: 'tourism.sights' }
];

function categoriesForKeyword(text) {
  const normalized = text.normalize('NFKC').trim().toLowerCase();
  return CATEGORY_KEYWORDS.filter(entry => entry.terms.includes(normalized)).map(entry => entry.category);
}

function getGeoapifyApiKey() {
  const key = window.SENSOR_CONFIG?.geoapifyApiKey;
  if (typeof key !== 'string' || !key.trim() || key === 'YOUR_GEOAPIFY_API_KEY') {
    const error = new Error('Search API key is not configured');
    error.code = 'SEARCH_NOT_CONFIGURED';
    throw error;
  }
  return key.trim();
}

const GEOAPIFY_CACHE_TTL_MS = 5 * 24 * 60 * 60 * 1000;
const GEOAPIFY_CACHE_STORAGE_KEY = 'sheikah_geoapify_cache_v2';

function readGeoapifyCache() {
  try {
    const entries = JSON.parse(localStorage.getItem(GEOAPIFY_CACHE_STORAGE_KEY) || '[]');
    return Array.isArray(entries) ? entries.filter(entry => entry &&
      typeof entry.signature === 'string' && Array.isArray(entry.features) &&
      Number.isFinite(entry.created) && Date.now() - entry.created < GEOAPIFY_CACHE_TTL_MS) : [];
  } catch { return []; }
}

function saveGeoapifyCache() {
  const entries = fetchGeoapify.cache.filter(entry => Date.now() - entry.created < GEOAPIFY_CACHE_TTL_MS).slice(-399);
  // Bound storage use and evict oldest responses before user history is affected.
  let serialized = JSON.stringify(entries);
  while (serialized.length > 1000000 && entries.length) {
    entries.shift();
    serialized = JSON.stringify(entries);
  }
  fetchGeoapify.cache = entries;
  try { localStorage.setItem(GEOAPIFY_CACHE_STORAGE_KEY, serialized); }
  catch { /* Storage unavailable: keep the bounded in-memory cache. */ }
}

async function fetchGeoapify(path, parameters) {
  const apiKey = getGeoapifyApiKey();
  const details = path === '/v2/place-details';
  const cacheable = details || path === '/v1/geocode/search' || path === '/v2/places';
  const circle = parameters.filter?.split(':');
  const coordinates = circle?.[0] === 'circle' ? circle[1].split(',').map(Number) : null;
  const cache = fetchGeoapify.cache ||= readGeoapifyCache();
  const now = Date.now();
  // Match all request options except the search origin, which may differ by 5 metres.
  const signature = JSON.stringify([path, Object.entries({ ...parameters,
    ...(coordinates ? { filter: `circle:origin,${coordinates[2]}`, bias: 'proximity:origin' } : {})
  }).sort(([a], [b]) => a.localeCompare(b))]);
  if (cacheable && (coordinates || details)) {
    const cached = cache.find(entry => entry.signature === signature && now - entry.created < GEOAPIFY_CACHE_TTL_MS &&
      (details || getDistance(coordinates[1], coordinates[0], entry.lat, entry.lng) <= 5));
    if (cached) {
      const features = JSON.parse(JSON.stringify(cached.features));
      features.cacheExpires = cached.created + GEOAPIFY_CACHE_TTL_MS;
      return features;
    }
  }
  if (typeof traceLocation === 'function') traceLocation('search.request', path);
  globalThis.SensorRuntimeDiagnostics?.count('search.request');
  const url = new URL(path, 'https://api.geoapify.com');
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));
  url.searchParams.set('apiKey', apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    globalThis.SensorRuntimeDiagnostics?.count('search.response');
    if (typeof traceLocation === 'function') traceLocation('search.response', `status=${response.status}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error('Invalid search response');
    if (cacheable && (coordinates || details)) {
      // Keep only recent successful responses; failures are never cached.
      fetchGeoapify.cache.push({ signature, ...(coordinates ? {lat: coordinates[1], lng: coordinates[0]} : {}),
        created: Date.now(), features: JSON.parse(JSON.stringify(data.features)) });
      saveGeoapifyCache();
      data.features.cacheExpires = Date.now() + GEOAPIFY_CACHE_TTL_MS;
    }
    return data.features;
  } finally {
    clearTimeout(timer);
  }
}

// Supplement only full pages that are at least 75% muted, with at most three calls.
async function fetchKeywordCandidates(path, parameters, excludeChallengePlaces = false) {
  const mutedIds = new Set(loadSavedData().arrivals.filter(item => item.muted).map(item => item.id));
  const geocoding = path === '/v1/geocode/search';
  const collected = new Map();
  for (let page = 0; page < 3; page++) {
    let features;
    try {
      features = await fetchGeoapify(path, {
        ...parameters, limit: geocoding ? (page + 1) * 20 : 20,
        ...(!geocoding ? { offset: page * 20 } : {})
      });
    } catch (error) {
      if (!page) throw error;
      return { features: [...collected.values()], partial: true };
    }
    const newFeatures = [];
    for (const feature of features) {
      const p = feature.properties || {};
      const id = p.place_id || JSON.stringify(feature);
      if (!collected.has(id)) newFeatures.push(feature);
      collected.set(id, feature);
    }
    const mutedCount = newFeatures.filter(feature => mutedIds.has(feature.properties?.place_id) ||
      (excludeChallengePlaces && isExcludedChallengePlace(feature.properties?.categories, feature.properties))).length;
    if (features.length < (geocoding ? (page + 1) * 20 : 20) ||
        newFeatures.length < 20 || mutedCount < 15) break;
  }
  return { features: [...collected.values()], partial: false };
}

async function searchGeoapify(text, position, radius, language, forcedCategories = null) {
  getGeoapifyApiKey();
  const common = {
    filter: `circle:${position.lng},${position.lat},${radius}`,
    bias: `proximity:${position.lng},${position.lat}`, lang: language
  };
  const requests = forcedCategories ? [] : [fetchKeywordCandidates('/v1/geocode/search', { ...common, text })];
  const categories = forcedCategories || categoriesForKeyword(text);
  if (categories.length) requests.push(fetchKeywordCandidates('/v2/places',
    { ...common, categories: categories.join(','), ...(forcedCategories ? { conditions: 'named' } : {}) }, Boolean(forcedCategories)));
  const responses = await Promise.allSettled(requests);
  const successful = responses.filter(result => result.status === 'fulfilled');
  if (!successful.length) throw new Error('Search unavailable');
  const places = new Map();
  for (const result of successful) for (const feature of result.value.features) {
    const p = feature.properties || {};
    if (forcedCategories && isExcludedChallengePlace(p.categories, p)) continue;
    const lat = p.lat ?? feature.geometry?.coordinates?.[1];
    const lng = p.lon ?? feature.geometry?.coordinates?.[0];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (getDistance(position.lat, position.lng, lat, lng) > radius) continue;
    const identity = geoapifyPlaceIdentity(p, p.address_line1 || p.formatted);
    const name = identity.name;
    if (!name) continue;
    const id = p.place_id || `geo:${lat}:${lng}:${name}`;
    const previous = places.get(id);
    places.set(id, {
      ...identity, id, name, lat, lng, categories: p.categories || previous?.categories || [], formatted_address: p.formatted || previous?.formatted_address || '',
      phone: p.contact?.phone || previous?.phone || null,
      website: p.website || previous?.website || null
    });
  }
  return {
    places: [...places.values()].sort((a, b) =>
      getDistance(position.lat, position.lng, a.lat, a.lng) - getDistance(position.lat, position.lng, b.lat, b.lng)),
    partial: successful.length !== responses.length || successful.some(result => result.value.partial)
  };
}

async function searchSecretChallenge(position, radius, language, mode) {
  const groups = CHALLENGE_GROUPS.filter(group => group.id !== 'secret');
  const responses = await Promise.allSettled(groups.map(group =>
    searchGeoapify('', position, radius, language, group.categories)));
  const successful = responses.filter(result => result.status === 'fulfilled');
  if (!successful.length) {
    throw responses.find(result => result.status === 'rejected').reason;
  }
  const mutedIds = new Set(loadSavedData().arrivals.filter(item => item.muted).map(item => item.id));
  const hasOutsideCandidate = mode === 'random' && successful.some(result =>
    result.value.places.some(place => !mutedIds.has(place.id) && destinationDistance(position, place) > 20));
  const places = new Map();
  for (const result of successful) {
    const candidates = result.value.places.filter(place => !mutedIds.has(place.id) &&
      (!hasOutsideCandidate || destinationDistance(position, place) > 20));
    if (mode === 'random') {
      // Partial Fisher-Yates: sample without replacement from each group's results.
      const count = Math.min(5, candidates.length);
      for (let i = 0; i < count; i++) {
        const j = i + Math.floor(Math.random() * (candidates.length - i));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      candidates.length = count;
    }
    for (const place of candidates) places.set(place.id, place);
  }
  return {
    places: [...places.values()],
    partial: successful.length !== responses.length || successful.some(result => result.value.partial)
  };
}

async function executeSearch(refreshCandidates = false, accessGranted = false) {
  if (typeof traceLocation === 'function') traceLocation('executeSearch', `gps=${Boolean(appState.currentPos)} active=${appState.isTracking}`);
  if (!appState.isTracking || appState.isPaused || !appState.currentPos || isSearchInProgress ||
      appState.pinpointTarget || (!refreshCandidates && appState.randomTarget) || !appState.activeKeyword) return false;
  if (appState.accessCommitPending && !accessGranted) return false;
  const generation = searchGeneration;
  if (!accessGranted && initialSearchAccessGranted) {
    initialSearchAccessGranted = false;
    accessGranted = true;
  }
  if (!accessGranted) {
    if (rewardedSearchPending) return;
    const kind = appState.activeChallenge?.group === 'secret' ? 'secret' : 'normal';
    const continued = await runRewardedSearch(kind, () => {
      if (generation !== searchGeneration || !appState.isTracking) return false;
      // Authorization applies to this search only, using the latest GPS fix.
      return executeSearch(refreshCandidates, true);
    }, { requireFullCost: true });
    if (!continued && generation === searchGeneration && appState.isTracking) {
      stopSearchAndReset();
    }
    return;
  }
  isSearchInProgress = true;
  appState.explorationPhase = "searching";
  globalThis.SensorExplorationRecovery?.checkpoint();
  const position = { ...appState.currentPos };
  appState.lastSearchedPos = position;
  const radius = RADIUS_OPTIONS[radiusIndex];
  const rText = radius >= 1000 ? `${radius / 1000}km` : `${radius}m`;
  document.getElementById('target-meta-info').textContent = I18N[currentLang].targetMeta(appState.activeKeyword, rText);
  try {
    const result = appState.activeChallenge?.group === 'secret'
      ? await searchSecretChallenge(position, radius, currentLang, appState.targetMode)
      : await searchGeoapify(appState.activeKeyword.trim(), position, radius, currentLang, appState.challengeCategories);
    if (generation !== searchGeneration || !appState.isTracking) return false;
    if (result.partial) console.warn('One search source is unavailable; using available results.');
    appState.explorationPhase = "ready";
    appState.places = result.places;
    const fixedTarget = refreshCandidates ? appState.randomTarget : null;
    if (fixedTarget && !appState.places.some(place => place.id === fixedTarget.id)) appState.places.push(fixedTarget);
    const retained = fixedTarget && getSearchCandidates().find(place => place.id === fixedTarget.id);
    if (retained) appState.randomTarget = retained;
    else chooseSearchTarget(position);
    return true;
  } catch (error) {
    if (generation !== searchGeneration || !appState.isTracking) return false;
    appState.explorationPhase = 'failed';
    console.warn('Geoapify search unavailable.');
    if (!refreshCandidates) {
      appState.places = [];
      appState.randomTarget = null;
    }
    document.getElementById('target-meta-info').textContent = error.code === 'SEARCH_NOT_CONFIGURED'
      ? (currentLang === 'ja' ? '検索設定が未完了です。' : 'Search is not configured.')
      : (currentLang === 'ja' ? '検索に失敗しました。時間をおいて再試行してください。'
        : 'Search failed. Please try again later.');
  } finally {
    if (generation === searchGeneration) {
      isSearchInProgress = false;
      globalThis.SensorExplorationRecovery?.checkpoint();
      evaluateSensorCycle();
    }
  }
}

function showConditionToast(message, showSensorDiagram = false) {
  hideOtherSettingToasts('condition-mode-toast');
  const toast = document.getElementById('condition-mode-toast');
  toast.textContent = message;
  toast.classList.toggle('has-sensor-diagram', showSensorDiagram);
  document.getElementById('sensor-explanation-diagram')?.remove();
  if (showSensorDiagram) {
    const image = document.createElement('img');
    image.id = 'sensor-explanation-diagram';
    image.className = 'sensor-explanation-diagram';
    image.src = appState.sensorDetail === 'standard'
      ? 'icons/sensor-standard.svg' : 'icons/sensor-detailed.svg';
    image.alt = currentLang === 'ja'
      ? (appState.sensorDetail === 'standard' ? '歩行中に反応する5段階センサーの角度と反応強度' : '停止中も反応する9段階センサーの角度と反応強度')
      : (appState.sensorDetail === 'standard' ? 'Five sensor levels while walking: angles and signal strength' : 'Nine sensor levels, also while stopped: angles and signal strength');
    document.getElementById('app-container').appendChild(image);
  }
  toast.classList.add('show');
  clearTimeout(conditionToastTimer);
  conditionToastTimer = setTimeout(() => toast.classList.remove('show'), showSensorDiagram ? 8000 : 4500);
}

function updateRadiusAccess() {
  const select = document.getElementById('radius-select');
  const max = challengeProgress().maxRadius;
  if (!appState.activeChallenge && RADIUS_OPTIONS[radiusIndex] > max) {
    radiusIndex = RADIUS_OPTIONS.indexOf(max);
    localStorage.setItem('sheikah_last_radius_idx', String(radiusIndex));
  }
  const options = RADIUS_OPTIONS.flatMap((radius, index) => {
    if (radius > max) return [];
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = getRadiusText(radius);
    return [option];
  });
  select.replaceChildren(...options);
  select.disabled = Boolean(appState.activeChallenge);
  select.value = String(radiusIndex);
  document.getElementById('radius-val').textContent = getRadiusText(RADIUS_OPTIONS[radiusIndex]);
}

function applyFeatureAccess() {
  const progress = challengeProgress();
  if (!progress.target) appState.targetMode = 'nearest';
  if (!progress.sensor) appState.sensorDetail = 'standard';
  updateRadiusAccess();
  updateConditionButtons();
}

function releaseChallengeSettings() {
  if (!appState.activeChallenge) return;
  const saved = appState.challengeSettings;
  appState.activeChallenge = null;
  appState.challengeCategories = null;
  appState.challengeSettings = null;
  appState.targetMode = saved.targetMode;
  appState.sensorDetail = saved.sensorDetail;
  radiusIndex = saved.radiusIndex;
  document.getElementById('keyword-input').readOnly = false;
  document.getElementById('keyword-input').disabled = false;
  applyFeatureAccess();
  renderChallenges();
}

let challengePresentationTimer = null;

function showChallengePresentation(challenge, completed = false, arrival = null) {
  const banner = document.getElementById('challenge-presentation');
  if (!banner) return;
  stopSelectedSounds('presentation');
  clearTimeout(challengePresentationTimer);
  banner.classList.remove('is-visible', 'is-leaving', 'is-place-visible');
  banner.classList.toggle('is-complete', completed);
  banner.classList.toggle('is-arrival', !!arrival);
  const ja = currentLang === 'ja';
  document.getElementById('challenge-presentation-label').textContent = challenge
    ? (ja ? 'チャレンジ' : 'CHALLENGE') : (ja ? '到着' : 'ARRIVAL');
  const name = document.getElementById('challenge-presentation-name');
  name.textContent = challenge ? challengeName(challenge) : '';
  name.hidden = !challenge;
  const state = document.getElementById('challenge-presentation-state');
  state.textContent = completed ? 'COMPLETE'
    : arrival ? (ja ? '到達を記録しました' : 'ARRIVAL RECORDED') : 'CHALLENGE START';
  state.hidden = !challenge;
  const place = document.getElementById('challenge-presentation-place');
  const arrivalMessage = arrival
    ? (ja ? `${arrival.name}への到達を記録しました` : `Arrival at ${arrival.name} recorded`) : '';
  // Lay out the actual arrival text from the start, including its wrapped lines.
  place.textContent = arrivalMessage;
  place.hidden = !arrivalMessage || completed;
  // Restart the animation even when a new event replaces an existing banner.
  void banner.offsetWidth;
  banner.classList.add('is-visible');
  const readingTime = Math.min(11000, Math.max(6500, Array.from(arrivalMessage).length * 140));
  const fadeOut = () => {
    banner.classList.add('is-leaving');
    challengePresentationTimer = setTimeout(() => {
      banner.classList.remove('is-visible', 'is-leaving');
      challengePresentationTimer = null;
    }, 1400);
  };
  // Keep the challenge heading and COMPLETE in place while revealing the arrival below.
  challengePresentationTimer = setTimeout(() => {
    if (completed && arrival) {
      place.textContent = arrivalMessage;
      place.hidden = false;
      banner.classList.add('is-place-visible');
      playChallengePlaceCue();
      challengePresentationTimer = setTimeout(fadeOut, readingTime);
      return;
    }
    fadeOut();
  }, completed ? 4400 : arrival ? readingTime : 2800);
  if (challenge) playChallengeFanfare(completed);
}

function playChallengeFanfare(completed) {
  if (appState.isMuted) return;
  if (completed) return playSelectedFanfare(true);
  try {
    if (!audioCtx) initAudio();
    if (!audioCtx || audioCtx.state !== 'running') return;
    // Completion uses A31 above; the start chime shares the volume curve.
    const notes = [523.25, 783.99];
    notes.forEach((frequency, index) => {
      const start = audioCtx.currentTime + index * 0.12;
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16 * getSoundVolumeGain(), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
      oscillator.connect(gain);
      gain.connect(getSoundOutput(audioCtx));
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + 0.5);
    });
  } catch (error) { /* Visual feedback remains available without audio support. */ }
}

function startChallenge(challenge) {
  if (!isChallengeAvailable(challenge)) return;
  return runRewardedSearch(challenge.group === 'secret' ? 'secret' : 'normal', () => {
    if (!isChallengeAvailable(challenge)) return false;
    stopSearchAndReset();
    appState.challengeSettings = { targetMode: appState.targetMode, sensorDetail: appState.sensorDetail,
      radiusIndex };
    appState.activeChallenge = challenge;
    appState.challengeCategories = challengeCategoriesForGroup(challenge.group);
    appState.targetMode = challenge.mode;
    appState.sensorDetail = challenge.sensor;
    radiusIndex = RADIUS_OPTIONS.indexOf(challenge.radius);
    const input = document.getElementById('keyword-input');
    input.value = challengeName(challenge);
    input.blur();
    input.readOnly = true;
    input.disabled = true;
    checkMainInputClearState();
    updateRadiusAccess();
    startSearchFromSet(true);
    renderChallenges();
    navigateToMain();
    showChallengePresentation(challenge);
    return true;
  });
}

let pendingChallenge = null;
let challengeStartPending = false;
async function requestChallengeStart(challenge) {
  const dialog = document.getElementById('challenge-start-dialog');
  if (!isChallengeAvailable(challenge) || challengeStartPending || dialog.open || rewardedSearchPending) return;
  challengeStartPending = true;
  const previouslyPaused = appState.isPaused;
  appState.isPaused = true;
  evaluateSensorCycle();
  window.SensorRewardAds.language = () => currentLang;
  try {
    if (!await window.SensorRewardAds.prepare() || !isChallengeAvailable(challenge)) return;
    pendingChallenge = challenge;
    const ja = currentLang === 'ja';
    dialog.returnValue = '';
    document.getElementById('challenge-start-question').textContent = ja
      ? 'チャレンジを開始しますか？' : 'Start this challenge?';
    document.getElementById('challenge-start-name').textContent = challengeName(challenge) +
      (appState.isTracking ? (ja ? '（現在の探索は終了します）' : ' (the current search will end)') : '');
    document.getElementById('challenge-start-yes').textContent = ja ? 'はい' : 'Yes';
    document.getElementById('challenge-start-no').textContent = ja ? 'いいえ' : 'No';
    dialog.showModal();
    document.getElementById('challenge-start-question').focus({ preventScroll: true });
  } finally {
    challengeStartPending = false;
    appState.isPaused = previouslyPaused;
    evaluateSensorCycle();
  }
}

function getChallengeArrivals(db, challenge) {
  const group = CHALLENGE_GROUPS.find(g => g.id === challenge.group);
  const legacyNames = [
    `${group.ja}${challenge.radius / 1000}km${challenge.mode === 'nearest' ? '最寄り' : 'ランダム'}`,
    `${group.en} ${challenge.radius / 1000}km ${challenge.mode === 'nearest' ? 'Nearest' : 'Random'}`
  ];
  return db.arrivals.filter(item => (Array.isArray(item.challengeIds) && item.challengeIds.includes(challenge.id))
    || legacyNames.includes(item.keyword));
}

function openChallengeArrivals(challenge) {
  hideOtherSettingToasts();
  appState.selectedChallengeForHistory = challenge.id;
  appState.fromChallenge = true;
  appState.fromAllHistory = false;
  pageSpotDetail.classList.remove('open');
  pageHistory.classList.remove('open');
  pageKeywords.classList.remove('open');
  pageAllHistory.classList.remove('open');
  pageChallenges.classList.add('open');
  renderChallengeArrivals();
  pageChallengeKeywords.classList.add('open');
  updateFooterActive(0);
}

function renderChallengeArrivals() {
  const challenge = CHALLENGES.find(c => c.id === appState.selectedChallengeForHistory);
  if (!challenge) return;
  const db = loadSavedData();
  const t = I18N[currentLang];
  const container = document.getElementById('challenge-arrivals-list-container');
  document.getElementById('back-to-challenges').textContent = currentLang === 'ja' ? '◀チャレンジ一覧' : '◀Challenges';
  document.getElementById('challenge-arrivals-title').textContent = challengeName(challenge);
  container.replaceChildren();
  const items = getChallengeArrivals(db, challenge).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'challenge-help';
    empty.textContent = currentLang === 'ja' ? 'このチャレンジで到達したスポットはまだありません。' : 'No arrivals recorded for this challenge yet.';
    container.append(empty);
  }
  for (const item of items) {
    const date = new Date(item.date);
    const dateStr = `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    const basePos = appState.currentPos || lastKnownPos;
    const distance = getDistance(basePos.lat, basePos.lng, item.lat, item.lng);
    const distStr = distance >= 1000 ? `${(distance/1000).toFixed(1)}km` : `${Math.round(distance)}m`;
    const row = document.createElement('div');
    row.className = 'list-item';
    row.dataset.spotId = item.id;
    row.innerHTML = `
      <div class="list-item-left">
        <span class="list-item-title">${escapeHtml(item.name)}</span>
        <div class="list-item-sub">${t.arrivalDate(dateStr, distStr)}</div>
      </div>
      <div class="action-button-row">
        <button class="btn-sheikah-sm btn-pinpoint-set">SET</button>
        <button class="btn-sheikah-sm btn-toggle-radar ${item.muted ? 'off' : 'active'}">${item.muted ? t.radarOff : t.radarOn}</button>
        <button class="btn-sheikah-sm btn-copy-sm">${t.copyBtn}</button>
      </div>`;
    row.onclick = () => {
      appState.fromChallenge = true;
      appState.fromAllHistory = false;
      openSpotDetailModal(item, items);
    };
    row.querySelector('.btn-pinpoint-set').onclick = event => {
      event.stopPropagation();
      setPinpointTargetAndStart(item);
    };
    row.querySelector('.btn-toggle-radar').onclick = event => {
      event.stopPropagation();
      item.muted = !item.muted;
      saveAppData(db);
      renderChallengeArrivals();
    };
    row.querySelector('.btn-copy-sm').onclick = event => {
      event.stopPropagation();
      copyPlaceNameToClipboard(item.name);
    };
    container.append(row);
  }
}

function renderChallenges() {
  const container = document.getElementById('challenges-list-container');
  if (!container) return;
  const ja = currentLang === 'ja';
  const db = loadSavedData();
  const progress = challengeProgress(db);
  document.getElementById('title-page-challenges').textContent = ja ? 'チャレンジ一覧' : 'Challenges';
  container.replaceChildren();
  if (appState.activeChallenge) {
    const row = document.createElement('div');
    row.className = 'list-item challenge-active';
    const label = document.createElement('span');
    label.textContent = challengeName(appState.activeChallenge) + (appState.isPaused ? (ja ? ' 一時停止中' : ' Paused') : (ja ? ' 実行中' : ' Active'));
    const stop = document.createElement('button');
    stop.className = 'btn-sheikah challenge-set';
    stop.textContent = ja ? '停止' : 'Stop';
    stop.onclick = () => {
      stopSearchAndReset();
      document.getElementById('keyword-input').value = '';
      checkMainInputClearState();
    };
    row.append(label, stop);
    container.append(row);
  }
  const milestone = (text, count, required) => {
    const row = document.createElement('div');
    row.className = 'list-item challenge-milestone' + (count >= required ? ' achieved' : '');
    const label = document.createElement('span');
    label.className = 'list-item-title';
    label.textContent = `${count >= required ? '✓ ' : ''}${text}`;
    row.append(label);
    container.append(row);
  };
  for (const stage of CHALLENGE_STAGES) {
    for (const challenge of CHALLENGES.filter(c => c.stage === stage.id)) {
      const row = document.createElement('div');
      const available = isChallengeAvailable(challenge, progress);
      const completed = progress.completed.has(challenge.id);
      row.className = 'list-item challenge-row' + (available ? '' : ' challenge-locked') + (completed ? ' challenge-completed' : '');
      const content = document.createElement('div');
      content.className = 'list-item-row';
      const left = document.createElement('div');
      left.className = 'list-item-left';
      const title = document.createElement('span');
      title.className = 'list-item-title';
      title.textContent = challengeName(challenge);
      if (completed) {
        const check = document.createElement('span');
        check.className = 'challenge-completed-check';
        check.textContent = '✓ ';
        check.setAttribute('aria-hidden', 'true');
        title.prepend(check);
      }
      const status = document.createElement('div');
      status.className = 'list-item-sub';
      const group = CHALLENGE_GROUPS.find(g => g.id === challenge.group);
      const descriptions = ja ? {
        gourmet: '飲食店・カフェ・パン屋・食品店など', life: '買い物・駅・図書館・郵便局・医療施設など',
        leisure: '遊園地・文化施設・遊び場・スポーツ施設・海岸など', deep: '史跡・神社仏閣・文化遺産・地域の見どころなど', secret: 'グルメ・ライフ・レジャー・ディープの全対象'
      } : { gourmet: 'Restaurants, cafes, bakeries and food shops', life: 'Shops, stations, libraries, post offices and healthcare',
        leisure: 'Entertainment, playgrounds, sports facilities and beaches', deep: 'Historic sites, places of worship, heritage and local sights', secret: 'All places from the four groups' };
      row.title = descriptions[group.id];
      const arrivalCount = getChallengeArrivals(db, challenge).length;
      status.innerHTML = I18N[currentLang].arrivalCount(arrivalCount > 0 ? `<span class="arrival-count-number">${arrivalCount}</span>` : arrivalCount) + ' · '
        + (available ? (ja ? '挑戦可能' : 'Available') : (ja ? '未開放' : 'Locked'));
      if (completed) {
        const stateLabel = document.createElement('span');
        stateLabel.className = 'challenge-completed-label';
        stateLabel.textContent = ja ? 'クリア済み' : 'Completed';
        status.append(ja ? '　' : ' ', stateLabel);
      }
      left.append(title, status);
      const button = document.createElement('button');
      button.className = 'btn-sheikah-sm challenge-set';
      button.textContent = ja ? 'チャレンジ開始' : 'START';
      button.disabled = !available;
      button.setAttribute('aria-label', `${challengeName(challenge)} ${button.textContent}`);
      button.onclick = event => {
        event.stopPropagation();
        requestChallengeStart(challenge);
      };
      const actions = document.createElement('div');
      actions.className = 'item-right-actions';
      const arrow = document.createElement('span');
      arrow.className = 'challenge-history-arrow';
      arrow.textContent = '▶';
      arrow.setAttribute('aria-hidden', 'true');
      actions.append(button, arrow);
      content.append(left, actions);
      row.append(content);
      row.tabIndex = 0;
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', ja ? `${challengeName(challenge)}の到達スポット一覧` : `${challengeName(challenge)} arrivals`);
      row.onclick = () => openChallengeArrivals(challenge);
      row.onkeydown = event => {
        if (event.target === row && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          openChallengeArrivals(challenge);
        }
      };
      container.append(row);
    }
    if (stage.id === 'nearest1') {
      milestone(ja ? '1km最寄りチャレンジを3つクリアすると、1kmランダムチャレンジが開放されます。' : 'Complete 3 × 1km Nearest, then unlock 1km Random challenges', progress.nearest, 3);
    } else if (stage.id === 'random1') {
      milestone(ja ? '1kmランダムチャレンジを1つクリアすると、ターゲットロック機能でモードを切り替えられるようになります。' : 'Complete 1 × 1km Random, then unlock target lock switching', progress.random, 1);
      milestone(ja ? '1kmランダムチャレンジを3つクリアすると、3kmランダムチャレンジが開放されます。' : 'Complete 3 × 1km Random, then unlock 3km Random challenges', progress.random, 3);
      milestone(ja ? '1kmランダムチャレンジを5つクリアすると、高精度センサー（HI-SENS）機能が使えるようになります。' : 'Complete 5 × 1km Random, then unlock HI-SENS', progress.random, 5);
    } else {
      milestone(ja ? '3kmランダムチャレンジを1つクリアすると、検索範囲に10kmが指定できるようになります。' : 'Complete 1 × 3km Random, then unlock 10km', progress.wide, 1);
      milestone(ja ? '3kmランダムチャレンジを3つクリアすると、検索範囲に50kmが指定できるようになります。' : 'Complete 3 × 3km Random, then unlock 50km', progress.wide, 3);
      milestone(ja ? '15種類すべてのチャレンジをクリアすると、検索範囲に100kmが指定できるようになります。' : 'Complete all challenges, then unlock 100km', progress.completed.size, 15);
    }
  }
}

function getRadiusText(r) {
  return r >= 1000 ? `${r/1000}km` : `${r}m`;
}

updateRadiusAccess();

let pendingSearchEnd = null;
function requestSearchEndConfirmation(question, onConfirm) {
  const dialog = document.getElementById('challenge-end-dialog');
  if (dialog.open) return;
  pendingSearchEnd = onConfirm;
  const ja = currentLang === 'ja';
  document.getElementById('keyword-input').blur();
  document.getElementById('challenge-end-question').textContent = question;
  document.getElementById('challenge-end-no').textContent = ja ? 'いいえ' : 'No';
  document.getElementById('challenge-end-yes').textContent = ja ? 'はい' : 'Yes';
  hideOtherSettingToasts();
  dialog.showModal();
  document.getElementById('challenge-end-question').focus({ preventScroll: true });
}

function confirmChallengeEnd() {
  const challenge = appState.activeChallenge;
  if (!challenge) return;
  requestSearchEndConfirmation(currentLang === 'ja' ? 'チャレンジを終了しますか？' : 'End the challenge?', () => {
    if (appState.activeChallenge !== challenge) return;
    stopSearchAndReset();
    document.getElementById('keyword-input').value = '';
    checkMainInputClearState();
  });
}

function confirmKeywordSearchEnd(clearKeyword = false) {
  const generation = searchGeneration;
  requestSearchEndConfirmation(I18N[currentLang].confirmEndSearch, () => {
    if (appState.activeChallenge || generation !== searchGeneration || !appState.isTracking) return;
    stopSearchAndReset();
    if (clearKeyword) document.getElementById('keyword-input').value = '';
    checkMainInputClearState();
  });
}

document.getElementById('challenge-end-no').addEventListener('click', () => {
  pendingSearchEnd = null;
  document.getElementById('challenge-end-dialog').close();
});
document.getElementById('challenge-end-yes').addEventListener('click', () => {
  const onConfirm = pendingSearchEnd;
  pendingSearchEnd = null;
  document.getElementById('challenge-end-dialog').close();
  if (onConfirm) onConfirm();
});
document.getElementById('challenge-end-dialog').addEventListener('close', () => {
  if (!document.getElementById('challenge-end-dialog').open) pendingSearchEnd = null;
});
document.getElementById('challenge-end-dialog').addEventListener('cancel', () => {
  pendingSearchEnd = null;
});

document.getElementById('dial-btn').addEventListener('click', () => {
  if (appState.activeChallenge) confirmChallengeEnd();
});

document.getElementById('radius-select').addEventListener('change', (e) => {
  const next = Number(e.target.value);
  if (appState.activeChallenge || !Number.isInteger(next) || !RADIUS_OPTIONS[next] || RADIUS_OPTIONS[next] > challengeProgress().maxRadius) {
    updateRadiusAccess();
    return;
  }
  radiusIndex = next;
  document.getElementById('radius-val').textContent = getRadiusText(RADIUS_OPTIONS[radiusIndex]);
  localStorage.setItem('sheikah_last_radius_idx', radiusIndex.toString());
  if (appState.isTracking && !appState.pinpointTarget) {
    resetKeywordSearch();
    executeSearch();
    evaluateSensorCycle();
  }
});

function setupInputClear(inputEl, clearBtnEl, onClearCallback) {
  function check() {
    if (inputEl.value.trim().length > 0) {
      clearBtnEl.classList.add('show');
    } else {
      clearBtnEl.classList.remove('show');
    }
  }
  inputEl.addEventListener('input', check);
  check();

  clearBtnEl.addEventListener('click', (e) => {
    e.preventDefault();
    inputEl.value = '';
    check();
    inputEl.focus();
    if (onClearCallback) onClearCallback();
  });
}

const keywordInputEl = document.getElementById('keyword-input');
const btnInputClearEl = document.getElementById('btn-input-clear');

function checkMainInputClearState() {
  if (keywordInputEl.value.trim().length > 0) {
    btnInputClearEl.classList.add('show');
  } else {
    btnInputClearEl.classList.remove('show');
  }
}
keywordInputEl.addEventListener('input', checkMainInputClearState);
checkMainInputClearState();

btnInputClearEl.addEventListener('click', (e) => {
  e.preventDefault();
  if (appState.activeChallenge) {
    confirmChallengeEnd();
    return;
  } else if (appState.isTracking) {
    confirmKeywordSearchEnd(true);
    return;
  }
  keywordInputEl.value = '';
  checkMainInputClearState();
  keywordInputEl.blur();
});

keywordInputEl.addEventListener('focus', () => {
  if (appState.activeChallenge) {
    keywordInputEl.blur();
    return;
  }
  if (appState.isTracking && keywordInputEl.value.trim() !== "") {
    confirmKeywordSearchEnd();
  }
});

setupInputClear(
  document.getElementById('keyword-filter'),
  document.getElementById('btn-keyword-filter-clear'),
  () => renderKeywordsList()
);
setupInputClear(
  document.getElementById('history-filter'),
  document.getElementById('btn-history-filter-clear'),
  () => renderHistoryList()
);
setupInputClear(
  document.getElementById('all-history-filter'),
  document.getElementById('btn-all-history-filter-clear'),
  () => renderAllHistoryList()
);

function updateButtonStateUI() {
  updateConditionButtons();
  const t = I18N[currentLang];
  const indicator = document.getElementById('status-indicator');
  const setBtn = document.getElementById('set-btn');
  const labelSensor = document.getElementById('label-sensor-state');

  if (!appState.isTracking) {
    indicator.textContent = t.standby;
    indicator.className = "status-indicator paused";
    setBtn.className = "btn-set";
    setBtn.innerHTML = t.btnSet;
    labelSensor.textContent = t.sensorStandby;
  } else if (appState.isPaused) {
    indicator.textContent = t.paused;
    indicator.className = "status-indicator paused";
    setBtn.className = "btn-set paused";
    setBtn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor;"><path d="M8 5v14l11-7z"/></svg>`;
    labelSensor.textContent = t.sensorPaused;
  } else {
    indicator.textContent = t.searching;
    indicator.className = "status-indicator active";
    setBtn.className = "btn-set active";
    setBtn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    labelSensor.textContent = t.sensorActive;
  }

  const muteBtn = document.getElementById('mute-toggle-btn');
  const labelSound = document.getElementById('label-sound-state');
  const headphoneIcon = document.getElementById('sound-icon-headphone');
  const speakerIcon = document.getElementById('sound-icon-speaker');
  const mutedIcon = document.getElementById('sound-icon-muted');

  headphoneIcon.classList.toggle('active', appState.soundMode === 'headphone');
  speakerIcon.classList.toggle('active', appState.soundMode === 'speaker');
  mutedIcon.classList.toggle('active', appState.soundMode === 'muted');

  if (appState.soundMode === 'muted') {
    muteBtn.className = "btn-sheikah btn-sub-control sound-mode-btn";
    labelSound.textContent = t.soundModeMuted;
  } else if (appState.soundMode === 'speaker') {
    muteBtn.className = "btn-sheikah btn-sub-control active sound-mode-btn";
    labelSound.textContent = t.soundModeSpeaker;
  } else {
    muteBtn.className = "btn-sheikah btn-sub-control active sound-mode-btn";
    labelSound.textContent = t.soundModeHeadphone;
  }

  const volumeControl = document.getElementById('volume-control');
  const volumeDownBtn = document.getElementById('volume-down-btn');
  const volumeUpBtn = document.getElementById('volume-up-btn');

  if (appState.isMuted) {
    volumeControl.classList.add('disabled');
    volumeDownBtn.disabled = true;
    volumeUpBtn.disabled = true;
  } else {
    volumeControl.classList.remove('disabled');
    volumeDownBtn.disabled = false;
    volumeUpBtn.disabled = false;
  }

  const pulseButton = document.getElementById('pulse-rate-btn');
  const pulseLabel = document.getElementById('label-pulse-state');
  pulseButton.querySelectorAll('[data-pulse-rate]').forEach(icon => {
    icon.classList.toggle('active', icon.dataset.pulseRate === appState.pulseRate);
  });
  pulseLabel.textContent = `${appState.pulseRate.toUpperCase()} PULSE`;
  pulseButton.setAttribute('aria-label', t.pulseRateDescriptions[appState.pulseRate]);

  const wakeBtn = document.getElementById('wakelock-toggle-btn');
  const wakeIconOn = document.getElementById('wake-icon-on');
  const wakeIconOff = document.getElementById('wake-icon-off');
  const labelWake = document.getElementById('label-wake-state');
  
  wakeIconOn.classList.toggle('active', appState.wakeLockActive);
  wakeIconOff.classList.toggle('active', !appState.wakeLockActive);
  
  if (appState.wakeLockActive) {
    wakeBtn.className = "btn-sheikah btn-sub-control active wake-mode-btn";
    labelWake.textContent = t.wakeLockOn;
  } else {
    wakeBtn.className = "btn-sheikah btn-sub-control wake-mode-btn";
    labelWake.textContent = t.wakeLockOff;
  }
}

async function requestWakeLock() {
  if ('wakeLock' in navigator && appState.wakeLockActive) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (err) {}
  }
}

function releaseWakeLock() {
  if (wakeLockSentinel !== null) {
    wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
}

document.addEventListener('visibilitychange', async () => {
  if (wakeLockSentinel !== null && document.visibilityState === 'visible') {
    await requestWakeLock();
  }
});

let wakeModeToastTimer = null;
let toastBannerTimer = null;

function hideOtherSettingToasts(activeToastId = null) {
  [conditionToastTimer, soundModeToastTimer, volumeModeToastTimer,
    pulseRateToastTimer, wakeModeToastTimer, toastBannerTimer].forEach(clearTimeout);
  conditionToastTimer = soundModeToastTimer = volumeModeToastTimer = null;
  pulseRateToastTimer = wakeModeToastTimer = toastBannerTimer = null;
  const toastIds = ['condition-mode-toast', 'sound-mode-toast', 'volume-mode-toast',
    'pulse-rate-toast', 'wake-mode-toast', 'toast-banner'];
  toastIds.forEach(id => {
    if (id !== activeToastId) document.getElementById(id)?.classList.remove('show');
  });
}

// Clear the old toast before the tapped control handles the event and shows a new one.
function dismissToastsOnOutsideTap(event) {
  if (event.target.closest?.('.sound-mode-toast, #toast-banner')) return;
  const volumeButton = event.target.closest?.('#volume-down-btn, #volume-up-btn');
  hideOtherSettingToasts(volumeButton && !volumeButton.disabled ? 'volume-mode-toast' : null);
}
document.addEventListener('pointerdown', dismissToastsOnOutsideTap, true);
document.addEventListener('click', dismissToastsOnOutsideTap, true);

function showWakeModeToast() {
  const toast = document.getElementById('wake-mode-toast');
  if (!toast) return;

  hideOtherSettingToasts('wake-mode-toast');

  const t = I18N[currentLang];
  toast.textContent = appState.wakeLockActive
    ? t.wakeLockOnDesc
    : t.wakeLockOffDesc;

  toast.classList.add('show');

  if (wakeModeToastTimer) {
    clearTimeout(wakeModeToastTimer);
  }

  wakeModeToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    wakeModeToastTimer = null;
  }, 2800);
}

document.getElementById('wakelock-toggle-btn').addEventListener('click', async () => {
  appState.wakeLockActive = !appState.wakeLockActive;
  localStorage.setItem('sheikah_wake_lock', String(appState.wakeLockActive));

  if (appState.wakeLockActive) {
    await requestWakeLock();
  } else {
    releaseWakeLock();
  }

  updateButtonStateUI();
  showWakeModeToast();
});

let soundModeToastTimer = null;

function showSoundModeToast() {
  const toast = document.getElementById('sound-mode-toast');
  if (!toast) return;

  hideOtherSettingToasts('sound-mode-toast');

  const t = I18N[currentLang];
  if (appState.soundMode === 'headphone') {
    toast.textContent = t.soundModeHeadphoneDesc;
  } else if (appState.soundMode === 'speaker') {
    toast.textContent = t.soundModeSpeakerDesc;
  } else {
    toast.textContent = t.soundModeMutedDesc;
  }

  toast.classList.add('show');

  if (soundModeToastTimer) {
    clearTimeout(soundModeToastTimer);
  }

  soundModeToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    soundModeToastTimer = null;
  }, appState.soundMode === 'speaker' ? 10000 : 2800);
}

document.getElementById('mute-toggle-btn').addEventListener('click', () => {
  const modes = ['headphone', 'speaker', 'muted'];
  const currentIndex = modes.indexOf(appState.soundMode);
  appState.soundMode = modes[(currentIndex + 1) % modes.length];
  appState.isMuted = appState.soundMode === 'muted';
  if (appState.isMuted) stopSelectedSounds();

  localStorage.setItem('sheikah_sound_mode', appState.soundMode);

  if (appState.isMuted) {
    initAudio();
  } else {
    // Recreate even a nominally running engine when selecting a new route.
    recoverAudioOutput(true);
    playRadarSonar('normal');
  }

  updateButtonStateUI();
  showSoundModeToast();
});

let volumeModeToastTimer = null;

function showVolumeModeToast() {
  const toast = document.getElementById('volume-mode-toast');
  if (!toast) return;

  hideOtherSettingToasts('volume-mode-toast');

  toast.querySelectorAll('.volume-toast-bars > span').forEach((bar, index) => {
    bar.classList.toggle('active', index < appState.soundVolume * 2);
  });
  toast.querySelector('.volume-toast-value').textContent = `${appState.soundVolume * 10}%`;
  toast.classList.add('show');

  if (volumeModeToastTimer) {
    clearTimeout(volumeModeToastTimer);
  }

  volumeModeToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    volumeModeToastTimer = null;
  }, 1000);
}

function changeSoundVolume(step) {
  if (appState.isMuted) return;

  const nextVolume = Math.max(0.5, Math.min(10, appState.soundVolume + step / 2));
  if (nextVolume === appState.soundVolume) {
    showVolumeModeToast();
    return;
  }

  appState.soundVolume = nextVolume;
  for (const voice of selectedSoundVoices) voice.output.gain.value = getSoundVolumeGain(nextVolume);
  localStorage.setItem('sheikah_sound_volume', String(appState.soundVolume));

  playRadarSonar('near', 1);
  showVolumeModeToast();
}

document.getElementById('volume-down-btn').addEventListener('click', () => {
  changeSoundVolume(-1);
});

document.getElementById('volume-up-btn').addEventListener('click', () => {
  changeSoundVolume(1);
});

let pulseRateToastTimer = null;

function showPulseRateToast() {
  const toast = document.getElementById('pulse-rate-toast');
  if (!toast) return;

  hideOtherSettingToasts('pulse-rate-toast');

  const t = I18N[currentLang];
  toast.textContent = t.pulseRateDescriptions[appState.pulseRate];

  toast.classList.add('show');

  if (pulseRateToastTimer) {
    clearTimeout(pulseRateToastTimer);
  }

  pulseRateToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    pulseRateToastTimer = null;
  }, 2800);
}

document.getElementById('pulse-rate-btn').addEventListener('click', () => {
  const modes = ['low', 'mid', 'max'];
  appState.pulseRate = modes[(modes.indexOf(appState.pulseRate) + 1) % modes.length];
  localStorage.setItem('sheikah_pulse_rate', appState.pulseRate);
  updateButtonStateUI();
  evaluateSensorCycle();
  showPulseRateToast();
});

let conditionToastTimer = null;

function conditionDescription(kind) {
  const ja = currentLang === 'ja';
  if (kind === 'target') return (ja ? {
    random: 'ランダム：検索結果からランダムに1件をロックします',
    nearest: '最寄り：検索時点で最も近い1件をロックします',
    all: 'すべて：ロックせず、検索結果すべてに反応します'
  } : {
    random: 'Random: lock one randomly selected search result',
    nearest: 'Nearest: lock the closest result at search time',
    all: 'All: react to all search results without locking'
  })[appState.targetMode];
  return ja
    ? (appState.sensorDetail === 'standard' ? 'NORMAL SENS：歩行中に5段階で反応します' : 'HI-SENS：停止中も9段階で反応します')
    : (appState.sensorDetail === 'standard' ? 'NORMAL SENS: five reaction levels while walking' : 'HI-SENS: nine reaction levels, also while stopped');
}

function updateConditionButtons() {
  updateDetectionLabel();
  for (const kind of ['target', 'sensor-detail']) {
    const btn = document.getElementById(`${kind}-btn`);
    const mode = kind === 'target' ? appState.targetMode : appState.sensorDetail;
    btn.querySelectorAll('[data-mode]').forEach(el => el.classList.toggle('selected', el.dataset.mode === mode));
    const labels = { nearest: 'NEAREST LOCK', random: 'RANDOM LOCK', all: 'ALL TARGET', standard: 'NORMAL SENS', detailed: 'HI-SENS' };
    const locked = Boolean(appState.activeChallenge) || !(kind === 'target' ? challengeProgress().target : challengeProgress().sensor);
    btn.setAttribute('aria-disabled', String(locked));
    btn.classList.toggle('feature-locked', locked);
    btn.querySelector('.setting-current-mode').textContent = labels[mode];
    btn.setAttribute('aria-label', conditionDescription(kind));
    btn.title = conditionDescription(kind);
  }
}

for (const kind of ['target', 'sensor-detail']) {
  document.getElementById(`${kind}-btn`).addEventListener('click', () => {
    const target = kind === 'target';
    if (appState.activeChallenge || !(target ? challengeProgress().target : challengeProgress().sensor)) {
      showConditionToast(conditionDescription(kind) + '\n' + (appState.activeChallenge
        ? (currentLang === 'ja' ? 'チャレンジ中は変更できません。変更するにはチャレンジを停止してください。' : 'Stop the challenge to change this setting.')
        : (currentLang === 'ja' ? 'チャレンジ条件クリアで機能が開放されます' : 'Complete challenge requirements to unlock this feature.')), !target);
      return;
    }
    const key = target ? 'targetMode' : 'sensorDetail';
    const modes = target ? ['nearest', 'random', 'all'] : ['standard', 'detailed'];
    appState[key] = modes[(modes.indexOf(appState[key]) + 1) % modes.length];
    localStorage.setItem(`sheikah_${target ? 'target_mode' : 'sensor_detail'}`, appState[key]);
    updateConditionButtons();
    showConditionToast(conditionDescription(kind), !target);
    if (target && !appState.pinpointTarget) {
      resetKeywordSearch();
      executeSearch();
    }
    evaluateSensorCycle();
    globalThis.SensorExplorationRecovery?.checkpoint();
  });
}
updateConditionButtons();

function stopSearchAndReset() {
  stopSelectedSounds('radar');
  appState.explorationId = null;
  if (!appState.accessCommitPending) globalThis.SensorExplorationRecovery?.clear();
  releaseChallengeSettings();
  resetKeywordSearch();
  appState.pinpointTarget = null;
  appState.isTracking = false;
  appState.isPaused = false;
  appState.activeKeyword = "";
  if (radarTimer) { clearTimeout(radarTimer); radarTimer = null; }
  scheduledInterval = null;
  updateVisualRing('idle');
  document.getElementById('unknown-count').textContent = "--";
  document.getElementById('distance-info').textContent = "--";
  document.getElementById('target-meta-info').textContent = I18N[currentLang].targetMeta("", getRadiusText(RADIUS_OPTIONS[radiusIndex]));
  updateButtonStateUI();
}

let rewardedSearchPending = false;
function runRewardedSearch(kind, execute, options) {
  if (rewardedSearchPending) return Promise.resolve(false);
  if (!window.SensorRewardAds?.search) return Promise.resolve(false);
  rewardedSearchPending = true;
  const previouslyPaused = appState.isPaused;
  let launched = false;
  // Freeze the existing exploration while consent or a video is on screen.
  appState.isPaused = true;
  evaluateSensorCycle();
  window.SensorRewardAds.language = () => currentLang;
  return window.SensorRewardAds.search(kind, () => {
    appState.isPaused = previouslyPaused;
    appState.accessCommitPending = true;
    const result = execute();
    launched = result !== false;
    return result;
  }, { ...options,
    captureExploration: () => globalThis.SensorExplorationRecovery?.capture() || null,
    onExplorationError: () => globalThis.SensorExplorationRecovery?.onError()
  }).finally(() => {
    appState.accessCommitPending = false;
    rewardedSearchPending = false;
    if (!launched) appState.isPaused = previouslyPaused;
    globalThis.SensorExplorationRecovery?.checkpoint();
    if (launched && initialSearchAccessGranted && !appState.lastSearchedPos) executeSearch();
    evaluateSensorCycle();
  });
}

function startSearchFromSet(fromChallenge = false) {
  traceLocation('startSearchFromSet');
  if (appState.activeChallenge && !fromChallenge) {
    showToast(currentLang === 'ja' ? 'チャレンジを停止してから探索を変更してください。' : 'Stop the challenge before changing the search.');
    return;
  }
  initAudio();
  if (!fromChallenge) playRadarSonar('normal');
  if (appState.wakeLockActive) requestWakeLock();

  const inputVal = document.getElementById('keyword-input').value.trim();
  if (!inputVal) {
    alert("キーワードを入力してください");
    return;
  }
  const begin = () => {
    // Reject inputs changed while a consent dialog was open.
    if (document.getElementById('keyword-input').value.trim() !== inputVal) return false;
    resetKeywordSearch();
    appState.activeKeyword = inputVal;
    beginExplorationRecovery("waiting");
    initialSearchAccessGranted = true;
    appState.pinpointTarget = null;
    appState.isTracking = true;
    appState.isPaused = false;

    const db = loadSavedData();
    const now = new Date().toISOString();
    if (!appState.activeChallenge) {
      if (!db.keywordHistory[appState.activeKeyword]) {
        db.keywordHistory[appState.activeKeyword] = { lastSearch: now, lastArrival: null };
      } else {
        db.keywordHistory[appState.activeKeyword].lastSearch = now;
      }
    }
    saveAppData(db);

    updateButtonStateUI();
    evaluateSensorCycle();

    if (watchId === null || locationAccessState !== 'ready' || Date.now() - lastLocationFixTime > 30000) requestLocationAccess();
    executeSearch();
    return true;
  };
  return fromChallenge ? begin() : runRewardedSearch('normal', begin);
}

document.getElementById('set-btn').addEventListener('click', () => {
  if (rewardedSearchPending) return;
  initAudio();
  if (!appState.isTracking) {
    startSearchFromSet();
  } else {
    appState.isPaused = !appState.isPaused;
    if (appState.isPaused) {
      if (radarTimer) { clearTimeout(radarTimer); radarTimer = null; }
      scheduledInterval = null;
    }
    updateButtonStateUI();
    renderChallenges();
    evaluateSensorCycle();
    globalThis.SensorExplorationRecovery?.checkpoint();
  }
});

document.getElementById('keyword-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startSearchFromSet();
});

// ============================================================
// 画面遷移 & スワイプ & フッターナビゲーション
// ============================================================

const pageChallenges = document.getElementById('page-challenges');
const pageChallengeKeywords = document.getElementById('page-challenge-keywords');
const pageMainWrap = document.getElementById('page-main-wrap');
const pageKeywords = document.getElementById('page-keywords');
const pageHistory = document.getElementById('page-history');
const pageSpotDetail = document.getElementById('page-spot-detail');
function releaseHiddenDetailMap() {
  if (detailMinimapInstance && !pageSpotDetail.classList.contains('open')) {
    detailMinimapInstance.remove();
    detailMinimapInstance = null;
  }
}
// Navigation has several close paths; release the extra WebGL context for all.
new MutationObserver(releaseHiddenDetailMap).observe(pageSpotDetail, { attributes:true, attributeFilter:['class'] });
const pageAllHistory = document.getElementById('page-all-history');

const fnavBtnChallenges = document.getElementById('fnav-btn-challenges');
const fnavBtnMain = document.getElementById('fnav-btn-main');
const fnavBtnHistory = document.getElementById('fnav-btn-history');
const fnavBtnAll = document.getElementById('fnav-btn-all');

function updateFooterActive(tabIndex) {
  hideOtherSettingToasts();
  [fnavBtnChallenges, fnavBtnMain, fnavBtnHistory, fnavBtnAll].forEach((btn, idx) => {
    if (btn) {
      if (idx === tabIndex) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
}

function navigateToMain() {
  pageAllHistory.classList.remove('open');
  pageSpotDetail.classList.remove('open');
  pageHistory.classList.remove('open');
  pageKeywords.classList.remove('open');
  pageChallenges.classList.remove('open');
  pageChallengeKeywords.classList.remove('open');
  updateFooterActive(1);
  evaluateSensorCycle();
}

function bindSwipe(el, onSwipeLeft, onSwipeRight) {
  if (!el) return;
  let startX = 0;
  let startY = 0;

  el.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  el.addEventListener('touchend', (e) => {
    const diffX = e.changedTouches[0].clientX - startX;
    const diffY = e.changedTouches[0].clientY - startY;

    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.3) {
      if (diffX < 0 && onSwipeLeft) {
        hideOtherSettingToasts();
        onSwipeLeft();
      } else if (diffX > 0 && onSwipeRight) {
        hideOtherSettingToasts();
        onSwipeRight();
      }
    }
  }, { passive: true });
}

function setupSwipeAndNavigationSystem() {
  // フッタータップ時の切り替え
  fnavBtnChallenges?.addEventListener('click', () => {
    pageChallengeKeywords.classList.remove('open');
    renderChallenges();
    pageAllHistory.classList.remove('open');
    pageSpotDetail.classList.remove('open');
    pageHistory.classList.remove('open');
    pageKeywords.classList.remove('open');
    pageChallenges.classList.add('open');
    updateFooterActive(0);
  });

  fnavBtnMain?.addEventListener('click', () => {
    navigateToMain();
  });

  fnavBtnHistory?.addEventListener('click', () => {
    pageChallengeKeywords.classList.remove('open');
    pageChallenges.classList.remove('open');
    pageAllHistory.classList.remove('open');
    pageSpotDetail.classList.remove('open');
    pageHistory.classList.remove('open');
    renderKeywordsList();
    pageKeywords.classList.add('open');
    updateFooterActive(2);
  });

  fnavBtnAll?.addEventListener('click', () => {
    pageChallengeKeywords.classList.remove('open');
    pageChallenges.classList.remove('open');
    pageSpotDetail.classList.remove('open');
    pageHistory.classList.remove('open');
    renderAllHistoryList();
    pageAllHistory.classList.add('open');
    updateFooterActive(3);
  });

  document.getElementById('back-to-challenges').addEventListener('click', () => {
    pageChallengeKeywords.classList.remove('open');
    renderChallenges();
    updateFooterActive(0);
  });
  bindSwipe(pageChallengeKeywords, () => navigateToMain(), () => {
    pageChallengeKeywords.classList.remove('open');
    renderChallenges();
    updateFooterActive(0);
  });

  document.getElementById('back-to-keywords')?.addEventListener('click', () => {
    pageHistory.classList.remove('open');
    updateFooterActive(2);
  });
  document.getElementById('back-to-history-list')?.addEventListener('click', () => {
    spotDetailGeneration++;
    pageSpotDetail.classList.remove('open');
    if (appState.fromAllHistory) {
      updateFooterActive(3);
    } else if (appState.fromChallenge) {
      renderChallengeArrivals();
      updateFooterActive(0);
    } else {
      updateFooterActive(2);
    }
  });

  // 1. チャレンジ一覧：左スワイプ時メインへ／右スワイプ不可
  bindSwipe(pageChallenges, () => {
    pageChallenges.classList.remove('open');
    updateFooterActive(1);
  }, null);

  // 2. メイン：左スワイプ時探索履歴一覧へ／右スワイプ時チャレンジ一覧へ
  bindSwipe(pageMainWrap, () => {
    renderKeywordsList();
    pageKeywords.classList.add('open');
    updateFooterActive(2);
  }, () => {
    pageChallenges.classList.add('open');
    updateFooterActive(0);
  });

  // 3. 探索履歴一覧：左スワイプ時図鑑一覧へ／右スワイプ時メインへ
  bindSwipe(pageKeywords, () => {
    renderAllHistoryList();
    pageAllHistory.classList.add('open');
    updateFooterActive(3);
  }, () => {
    pageKeywords.classList.remove('open');
    updateFooterActive(1);
  });

  // 3-1. 履歴図鑑一覧：左スワイプ時図鑑一覧へ／右スワイプ時探索履歴一覧へもどる
  bindSwipe(pageHistory, () => {
    renderAllHistoryList();
    pageAllHistory.classList.add('open');
    updateFooterActive(3);
  }, () => {
    pageHistory.classList.remove('open');
    updateFooterActive(2);
  });

  // 4. 図鑑一覧：左スワイプ不可／右スワイプ時探索履歴一覧へ
  bindSwipe(pageAllHistory, null, () => {
    pageAllHistory.classList.remove('open');
    updateFooterActive(2);
  });

  // 5. 図鑑詳細
  bindSwipe(pageSpotDetail, () => {
    // 左スワイプ時
    if (appState.fromChallenge) {
      navigateToMain();
    } else if (appState.fromAllHistory) {
      // 図鑑一覧配下：左スワイプ不可
    } else {
      // 履歴配下：図鑑一覧へ進む
      renderAllHistoryList();
      pageAllHistory.classList.add('open');
      updateFooterActive(3);
    }
  }, () => {
    // 右スワイプ時
    if (appState.fromChallenge) {
      pageSpotDetail.classList.remove('open');
      renderChallengeArrivals();
      updateFooterActive(0);
    } else if (appState.fromAllHistory) {
      pageSpotDetail.classList.remove('open');
      updateFooterActive(3);
    } else {
      pageSpotDetail.classList.remove('open');
      updateFooterActive(2);
    }
  });
}

let keywordListReturnScroll = 0;

document.getElementById('btn-delete-current-keyword').addEventListener('click', () => {
  const keyword = appState.selectedKeywordForHistory;
  if (!keyword || !confirm(I18N[currentLang].confirmDeleteKeyword(keyword))) return;
  const db = loadSavedData();
  deleteKeywordHistory(db, keyword);
  saveAppData(db);
  appState.selectedKeywordForHistory = null;
  pageHistory.classList.remove('open');
  pageSpotDetail.classList.remove('open');
  renderKeywordsList();
  renderAllHistoryList();
  pageKeywords.classList.add('open');
  updateFooterActive(2);
  document.getElementById('keywords-list-container').scrollTop = keywordListReturnScroll;
});

function renderKeywordsList() {
  const db = loadSavedData();
  const container = document.getElementById('keywords-list-container');
  container.innerHTML = '';
  const t = I18N[currentLang];

  const filterText = document.getElementById('keyword-filter').value.toLowerCase();
  const sortType = document.getElementById('sort-keywords').value;

  let keys = Object.keys(db.keywordHistory).filter(k => k.toLowerCase().includes(filterText));

  keys.sort((a, b) => {
    const dataA = db.keywordHistory[a];
    const dataB = db.keywordHistory[b];
    const countA = db.arrivals.filter(item => item.keywords.includes(a)).length;
    const countB = db.arrivals.filter(item => item.keywords.includes(b)).length;

    if (sortType === 'recent_search') {
      return new Date(dataB.lastSearch || 0) - new Date(dataA.lastSearch || 0);
    } else if (sortType === 'recent_arrival') {
      return new Date(dataB.lastArrival || 0) - new Date(dataA.lastArrival || 0);
    } else if (sortType === 'count_desc') {
      return countB - countA;
    }
  });

  keys.forEach(k => {
    const count = db.arrivals.filter(item => item.keywords.includes(k)).length;
    const div = document.createElement('div');
    div.className = 'list-item';
    div.dataset.keyword = k;
    div.innerHTML = `
      <div class="list-item-row">
        <div class="list-item-left">
          <span class="list-item-title">${escapeHtml(k)}</span>
          <div class="list-item-sub">${t.arrivalCount(count > 0 ? `<span class="arrival-count-number">${count}</span>` : count)}</div>
        </div>
        <div class="item-right-actions">
          <button class="btn-sheikah-sm btn-reset-search" data-key="${escapeHtml(k)}">SET</button>
          <div style="color: var(--sheikah-gold); font-size: 1.3rem;">▶</div>
        </div>
      </div>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-reset-search')) return;
      keywordListReturnScroll = container.scrollTop;
      appState.selectedKeywordForHistory = k;
      document.getElementById('history-header-title').textContent = `${k}`;
      document.getElementById('history-filter').value = '';
      document.getElementById('btn-history-filter-clear').classList.remove('show');
      renderHistoryList();
      pageHistory.classList.add('open');
    });

    div.querySelector('.btn-reset-search').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('keyword-input').value = k;
      document.getElementById('btn-input-clear').classList.add('show');
      pageKeywords.classList.remove('open');
      updateFooterActive(1);
      startSearchFromSet();
    });

    container.appendChild(div);
  });
}

document.getElementById('btn-delete-zero-keywords').addEventListener('click', () => {
  const db = loadSavedData();
  const t = I18N[currentLang];
  const zeroKeys = Object.keys(db.keywordHistory).filter(k => {
    const count = db.arrivals.filter(item => item.keywords.includes(k)).length;
    return count === 0;
  });

  if (zeroKeys.length === 0) {
    alert(t.noZeroKeywords);
    return;
  }

  if (confirm(t.confirmCleanZero(zeroKeys.length))) {
    zeroKeys.forEach(k => {
      delete db.keywordHistory[k];
    });
    saveAppData(db);
    renderKeywordsList();
  }
});

function compendiumCategoryId(item) {
  return (item.categories || []).filter(id => typeof id === 'string' && id).sort()[0] || '';
}

function compareCompendiumItems(a, b, sortType) {
  const nameOrder = () => a.name.localeCompare(b.name, currentLang === 'ja' ? 'ja' : 'en');
  if (sortType === 'near_asc' || sortType === 'near_desc') {
    const distanceA = Number.isFinite(a.calcDistance) ? a.calcDistance : null;
    const distanceB = Number.isFinite(b.calcDistance) ? b.calcDistance : null;
    if (distanceA === null) return distanceB === null ? 0 : 1;
    if (distanceB === null) return -1;
    return sortType === 'near_asc' ? distanceA - distanceB : distanceB - distanceA;
  }
  if (sortType === 'date_desc') return new Date(b.date) - new Date(a.date);
  if (sortType === 'date_asc') return new Date(a.date) - new Date(b.date);
  if (sortType === 'name_desc') return -nameOrder();
  if (sortType === 'category_asc') {
    const categoryA = compendiumCategoryId(a), categoryB = compendiumCategoryId(b);
    if (!categoryA) return categoryB ? 1 : nameOrder();
    if (!categoryB) return -1;
    return categoryA.localeCompare(categoryB, 'en', { numeric: true }) || nameOrder();
  }
  return nameOrder();
}

function initializeCompendiumSort(id, render) {
  const select = document.getElementById(id);
  const key = `sheikah_${id}`;
  try {
    const saved = localStorage.getItem(key);
    if (Array.from(select.options).some(option => option.value === saved)) select.value = saved;
  } catch (_) {}
  select.addEventListener('change', () => {
    try { localStorage.setItem(key, select.value); } catch (_) {}
    render();
  });
}

function renderHistoryList() {
  const db = loadSavedData();
  const container = document.getElementById('history-list-container');
  container.innerHTML = '';
  const t = I18N[currentLang];

  const filterText = document.getElementById('history-filter').value.toLowerCase();
  const sortType = document.getElementById('sort-history').value;

  let items = db.arrivals.filter(a => 
    a.keywords.includes(appState.selectedKeywordForHistory) &&
    a.name.toLowerCase().includes(filterText)
  );

  const basePos = appState.currentPos || lastKnownPos;
  if (basePos) {
    items.forEach(item => {
      item.calcDistance = getDistance(basePos.lat, basePos.lng, item.lat, item.lng);
    });
  }

  items.sort((a, b) => compareCompendiumItems(a, b, sortType));

  if (items.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #889; padding: 40px 10px; font-size: 0.95rem;">
        ${t.emptyHistory}
      </div>
    `;
  } else {
    items.forEach(item => {
      const d = new Date(item.date);
      const dateStr = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;

      let distStr = "";
      if (item.calcDistance !== undefined) {
        distStr = item.calcDistance >= 1000 ? `${(item.calcDistance/1000).toFixed(1)}km` : `${Math.round(item.calcDistance)}m`;
      }

      const div = document.createElement('div');
      div.className = 'list-item';
      div.dataset.spotId = item.id;
      div.innerHTML = `
        <div class="list-item-left">
          <span class="list-item-title">${escapeHtml(item.name)}</span>
          <div class="list-item-sub">${t.arrivalDate(dateStr, distStr)}</div>
        </div>
        <div class="action-button-row">
          <button class="btn-sheikah-sm btn-pinpoint-set">SET</button>
          <button class="btn-sheikah-sm btn-toggle-radar ${item.muted ? 'off' : 'active'}">
            ${item.muted ? t.radarOff : t.radarOn}
          </button>
          <button class="btn-sheikah-sm btn-copy-sm">${t.copyBtn}</button>
        </div>
      `;

      div.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        appState.fromAllHistory = false;
        appState.fromChallenge = false;
        openSpotDetailModal(item, items);
      });

      div.querySelector('.btn-pinpoint-set').addEventListener('click', (e) => {
        e.stopPropagation();
        setPinpointTargetAndStart(item);
      });

      div.querySelector('.btn-toggle-radar').addEventListener('click', (e) => {
        e.stopPropagation();
        item.muted = !item.muted;
        saveAppData(db);
        renderHistoryList();
      });

      div.querySelector('.btn-copy-sm').addEventListener('click', async (e) => {
        e.stopPropagation();
        copyPlaceNameToClipboard(item.name);
      });

      container.appendChild(div);
    });
  }
}

function renderAllHistoryList() {
  const db = loadSavedData();
  document.getElementById('all-history-count').textContent = currentLang === 'ja' ? `現在の図鑑件数 ${db.arrivals.length}件` : `${db.arrivals.length} spots in compendium`;
  const container = document.getElementById('all-history-list-container');
  container.innerHTML = '';
  const t = I18N[currentLang];

  const filterText = document.getElementById('all-history-filter').value.toLowerCase();
  const sortType = document.getElementById('sort-all-history').value;

  let items = db.arrivals.filter(a => a.name.toLowerCase().includes(filterText));

  const basePos = appState.currentPos || lastKnownPos;
  if (basePos) {
    items.forEach(item => {
      item.calcDistance = getDistance(basePos.lat, basePos.lng, item.lat, item.lng);
    });
  }

  items.sort((a, b) => compareCompendiumItems(a, b, sortType));

  if (items.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #889; padding: 40px 10px; font-size: 0.95rem;">
        ${t.emptyAllHistory}
      </div>
    `;
  } else {
    items.forEach(item => {
      const d = new Date(item.date);
      const dateStr = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;

      let distStr = "";
      if (item.calcDistance !== undefined) {
        distStr = item.calcDistance >= 1000 ? `${(item.calcDistance/1000).toFixed(1)}km` : `${Math.round(item.calcDistance)}m`;
      }

      const keywordLabel = [...(item.keywords || []), ...(item.challengeIds || [])
        .map(id => CHALLENGES.find(challenge => challenge.id === id))
        .filter(Boolean).map(challengeName)].map(escapeHtml).join(' / ');

      const div = document.createElement('div');
      div.className = 'list-item';
      div.dataset.spotId = item.id;
      div.innerHTML = `
        <div class="list-item-left">
          <span class="list-item-title">${escapeHtml(item.name)}</span>
          <div class="list-item-sub">${t.arrivalDate(dateStr, distStr)}</div>
          <div class="list-item-sub" style="color: #99aabb; margin-top: 2px;">${keywordLabel}</div>
        </div>
        <div class="action-button-row">
          <button class="btn-sheikah-sm btn-pinpoint-set">SET</button>
          <button class="btn-sheikah-sm btn-toggle-radar ${item.muted ? 'off' : 'active'}">
            ${item.muted ? t.radarOff : t.radarOn}
          </button>
          <button class="btn-sheikah-sm btn-copy-sm">${t.copyBtn}</button>
        </div>
      `;

      div.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        appState.fromAllHistory = true;
        appState.fromChallenge = false;
        openSpotDetailModal(item, items);
      });

      div.querySelector('.btn-pinpoint-set').addEventListener('click', (e) => {
        e.stopPropagation();
        setPinpointTargetAndStart(item);
      });

      div.querySelector('.btn-toggle-radar').addEventListener('click', (e) => {
        e.stopPropagation();
        item.muted = !item.muted;
        saveAppData(db);
        renderAllHistoryList();
      });

      div.querySelector('.btn-copy-sm').addEventListener('click', async (e) => {
        e.stopPropagation();
        copyPlaceNameToClipboard(item.name);
      });

      container.appendChild(div);
    });
  }
}

document.getElementById('all-history-filter').addEventListener('input', renderAllHistoryList);
initializeCompendiumSort('sort-all-history', renderAllHistoryList);

function copyPlaceNameToClipboard(text) {
  const t = I18N[currentLang];
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(t.toastCopied(text));
    }).catch(() => prompt("Copy:", text));
  } else {
    prompt("Copy:", text);
  }
}

function showToast(msg) {
  hideOtherSettingToasts('toast-banner');
  const toast = document.getElementById('toast-banner');
  document.getElementById('toast-text').textContent = msg;
  toast.classList.add('show');
  toastBannerTimer = setTimeout(() => {
    toast.classList.remove('show');
    toastBannerTimer = null;
  }, 2500);
}

function setPinpointTargetAndStart(item, hydrated = false) {
  if (!hydrated && window.SensorAppStorage) {
    return loadSpotDetails(item).then(detail => setPinpointTargetAndStart(detail, true));
  }
  if (appState.activeChallenge) {
    showToast(currentLang === 'ja' ? 'チャレンジを停止してから探索を変更してください。' : 'Stop the challenge before changing the search.');
    return;
  }
  return runRewardedSearch('normal', () => {
    resetKeywordSearch();
    const t = I18N[currentLang];
    beginExplorationRecovery('ready');
    appState.pinpointTarget = {
      ...item,
      id: item.id,
      name: item.name,
      lat: item.lat,
      lng: item.lng,
      geometry: item.geometry || null
    };
    appState.activeKeyword = item.keyword || item.name;
    document.getElementById('keyword-input').value = appState.activeKeyword;
    document.getElementById('btn-input-clear').classList.add('show');
    document.getElementById('target-meta-info').textContent = t.targetMetaPinpoint(item.name);

    navigateToMain();

    appState.isTracking = true;
    appState.isPaused = false;
    updateButtonStateUI();
    evaluateSensorCycle();
    return true;
  });
}

let detailNavigationIds = [];

function moveSpotDetail(offset) {
  const db = loadSavedData();
  const items = detailNavigationIds.map(id => db.arrivals.find(item => item.id === id)).filter(Boolean);
  const index = items.findIndex(item => item.id === appState.selectedSpotForDetail?.id);
  if (index < 0 || index + offset < 0 || index + offset >= items.length) return;
  openSpotDetailModal(items[index + offset], items);
}

let spotDetailGeneration = 0;

function openSpotDetailModal(item, orderedItems, hydrated = false) {
  if (!hydrated && window.SensorAppStorage) {
    const generation = ++spotDetailGeneration;
    if (orderedItems) detailNavigationIds = orderedItems.map(spot => spot.id);
    loadSpotDetails(item).then(detail => {
      if (generation === spotDetailGeneration) openSpotDetailModal(detail, orderedItems, true);
    }).catch(() => showToast(currentLang === 'ja' ? '図鑑詳細を読み込めませんでした。' : 'Unable to read spot details.'));
    return;
  }
  item = { ...item, ...(loadSavedData().arrivals.find(saved => saved.id === item.id) || {}) };
  if (orderedItems) detailNavigationIds = orderedItems.map(spot => spot.id);
  hideOtherSettingToasts();
  appState.selectedSpotForDetail = item;
  const t = I18N[currentLang];
  const db = loadSavedData();

  const backBtn = document.getElementById('back-to-history-list');
  if (appState.fromAllHistory) {
    backBtn.textContent = currentLang === 'ja' ? '◀図鑑一覧' : '◀Compendium';
  } else if (appState.fromChallenge) {
    backBtn.textContent = currentLang === 'ja' ? '◀到達スポット一覧' : '◀Challenge arrivals';
  } else {
    backBtn.textContent = currentLang === 'ja' ? '◀履歴図鑑' : '◀Places';
  }

  document.getElementById('detail-spot-name').textContent = item.name;
  document.getElementById('detail-spot-address').textContent = t.loadingAddress;
  const d = new Date(item.date);
  const dateStr = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  let distStr = "";
  const basePos = appState.currentPos || lastKnownPos;
  if (basePos) {
    const calcDist = getDistance(basePos.lat, basePos.lng, item.lat, item.lng);
    distStr = calcDist >= 1000 ? `${(calcDist/1000).toFixed(1)}km` : `${Math.round(calcDist)}m`;
  }
  document.getElementById('detail-spot-meta').textContent = t.arrivalDate(dateStr, distStr);
  document.getElementById('detail-spot-keyword').textContent =
    (currentLang === 'ja' ? '到達キーワード: ' : 'Arrival keywords: ') + (item.keywords || []).join(' / ');
  const challengeNames = (item.challengeIds || []).map(id => CHALLENGES.find(challenge => challenge.id === id))
    .filter(Boolean).map(challengeName);
  const challengeInfo = document.getElementById('detail-spot-challenges');
  challengeInfo.textContent = (currentLang === 'ja' ? '到達チャレンジ: ' : 'Arrival challenges: ') + challengeNames.join(' / ');
  challengeInfo.hidden = challengeNames.length === 0;
  document.getElementById('detail-spot-keyword').hidden = !(item.keywords || []).length;
  const index = detailNavigationIds.indexOf(item.id);
  const previous = document.getElementById('detail-btn-previous');
  const next = document.getElementById('detail-btn-next');
  previous.disabled = index <= 0;
  next.disabled = index < 0 || index >= detailNavigationIds.length - 1;
  previous.setAttribute('aria-label', currentLang === 'ja' ? '前の図鑑詳細' : 'Previous spot');
  next.setAttribute('aria-label', currentLang === 'ja' ? '次の図鑑詳細' : 'Next spot');
  previous.onclick = () => moveSpotDetail(-1);
  next.onclick = () => moveSpotDetail(1);

  const detailMapBox = document.getElementById('detail-map-container');
  detailMapBox.innerHTML = `<div class="no-photos-box">${currentLang === 'ja' ? '地図を準備中...' : 'Preparing map...'}</div>`;

  document.getElementById('detail-btn-pinpoint-set').onclick = () => setPinpointTargetAndStart(item);
  document.getElementById('detail-btn-copy').onclick = () => copyPlaceNameToClipboard(item.name);

  const radarBtn = document.getElementById('detail-btn-toggle-radar');
  function updateDetailRadarBtn() {
    if (item.muted) {
      radarBtn.textContent = t.radarOff;
      radarBtn.className = "btn-sheikah-sm off";
    } else {
      radarBtn.textContent = t.radarOn;
      radarBtn.className = "btn-sheikah-sm active";
    }
  }
  updateDetailRadarBtn();

  radarBtn.onclick = () => {
    item.muted = !item.muted;
    const db = loadSavedData();
    const savedItem = db.arrivals.find(arrival => arrival.id === item.id);
    if (savedItem) savedItem.muted = item.muted;
    saveAppData(db);
    updateDetailRadarBtn();
  };

  document.getElementById('detail-btn-delete-single').onclick = () => {
    if (confirm(t.confirmDeleteSingle(item.name))) {
      const db = loadSavedData();
      db.arrivals = db.arrivals.filter(a => a.id !== item.id);
      saveAppData(db);
      pageSpotDetail.classList.remove('open');
      if (appState.fromAllHistory) {
        renderAllHistoryList();
      } else if (appState.fromChallenge) {
        renderChallengeArrivals();
        renderChallenges();
      } else {
        renderHistoryList();
      }
    }
  };

  pageSpotDetail.classList.add('open');

  if (detailMinimapInstance) {
    detailMinimapInstance.remove();
    detailMinimapInstance = null;
  }
  const gallery = document.createElement('div');
  gallery.className = 'photo-gallery-scroll';

  const mapWrap = document.createElement('div');
  mapWrap.className = 'gallery-minimap-wrap';
  mapWrap.innerHTML = `
    <div id="detail-minimap"></div>
    <div class="minimap-badge">${t.minimapBadge}</div>
    <div class="map-attribution detail-map-attribution">${document.querySelector('.main-map-attribution').innerHTML.trim()}</div>
    <div class="map-load-status detail-map-status" hidden>地図を読み込めません / Map unavailable</div>
  `;
  gallery.appendChild(mapWrap);

  // Render the saved coordinates without a detail API request.
  renderDetailMap(item, gallery, detailMapBox);


  document.getElementById('detail-spot-address').textContent = item.formatted_address || t.noAddress;
  requestDestinationGeometry(item);
}

function renderDetailMap(item, gallery, detailMapBox) {
  detailMapBox.innerHTML = '';
  detailMapBox.appendChild(gallery);

  const mapContainer = gallery.querySelector('#detail-minimap');
  const statusElement = gallery.querySelector('.detail-map-status');
  if (mapContainer.dataset.initialized) return;
  if (typeof maplibregl === 'undefined') {
    statusElement.hidden = false;
    return;
  }
  try {
    detailMinimapInstance = SensorMap.createMap(mapContainer, arrivalPinPosition(item), currentMapStyleMode, statusElement);
    detailMinimapInstance.setOutlines(validDestinationGeometry(item.geometry) ? [item] : []);
    detailMinimapInstance.addMarker(arrivalPinPosition(item), currentMapStyleMode === 'botw', 1, item.name);
    mapContainer.dataset.initialized = 'true';
  } catch (error) {
    statusElement.hidden = false;
    console.warn('OSM detail map initialization failed:', error);
  }
}

document.getElementById('keyword-filter').addEventListener('input', renderKeywordsList);
document.getElementById('sort-keywords').addEventListener('change', renderKeywordsList);
document.getElementById('history-filter').addEventListener('input', renderHistoryList);
initializeCompendiumSort('sort-history', renderHistoryList);

function checkAndShowStartupModals() {
  if (startupRefreshPending) return;
  document.getElementById('btn-safety-ok').disabled = false;
  document.getElementById('btn-safety-ok').textContent = 'OK';
  const pwaOverlay = document.getElementById('pwa-prompt-overlay');
  const safetyOverlay = document.getElementById('safety-prompt-overlay');

  if (!isStandaloneMode) {
    safetyOverlay.classList.remove('show');
    pwaOverlay.classList.add('show');
  } else {
    pwaOverlay.classList.remove('show');
    safetyOverlay.classList.add('show');
  }
}

document.getElementById('btn-pwa-skip').addEventListener('click', () => {
  document.getElementById('pwa-prompt-overlay').classList.remove('show');
  document.getElementById('safety-prompt-overlay').classList.add('show');
});

document.getElementById('compass-status-btn').addEventListener('click', () => {
  requestCompassPermissionIfNeeded();
});

document.getElementById('location-access-retry').addEventListener('click', requestLocationAccess);

document.getElementById('btn-safety-ok').addEventListener('click', async () => {
  if (startupRefreshPending) return;
  const startupButton = document.getElementById('btn-safety-ok');
  startupButton.disabled = true;
  if (sensorInfoMonitoringSince === null) sensorInfoMonitoringSince = Date.now();
  // Both permission APIs run directly in the tap, before audio/wake-lock awaits.
  const compassPermission = requestCompassPermissionIfNeeded();
  requestLocationAccess();
  initAudio();
  if (appState.wakeLockActive) requestWakeLock();
  window.SensorRewardAds.language = () => currentLang;
  const recovery = window.SensorExplorationRecovery.load();
  if (!recovery && !await window.SensorRewardAds.startup()) {
    startupButton.disabled = false;
    return;
  }
  document.getElementById('safety-prompt-overlay').classList.remove('show');
  if (recovery) offerExplorationRecovery(recovery);
  await compassPermission;
});

setInterval(updateCompassStatus, 500);
// Refresh the notice even when neither sensor is delivering events.
setInterval(updateDetectionLabel, 1000);
document.addEventListener('visibilitychange', () => {
  if (sensorInfoMonitoringSince !== null) sensorInfoMonitoringSince = Date.now();
  updateDetectionLabel();
});

document.getElementById('challenge-start-no').addEventListener('click', () => {
  pendingChallenge = null;
  document.getElementById('challenge-start-dialog').close();
});
document.getElementById('challenge-start-yes').addEventListener('click', () => {
  const challenge = pendingChallenge;
  pendingChallenge = null;
  document.getElementById('challenge-start-dialog').close();
  if (challenge) startChallenge(challenge);
});
document.getElementById('challenge-start-dialog').addEventListener('close', () => {
  // Cancel returns to a neutral heading instead of outlining the opening card.
  if (!document.getElementById('challenge-start-dialog').open && pageChallenges.classList.contains('open')) {
    document.getElementById('title-page-challenges').focus({ preventScroll: true });
  }
});
document.getElementById('challenge-start-dialog').addEventListener('cancel', () => {
  pendingChallenge = null;
});
window.addEventListener('sensor-storage-change', () => {
  savedOutlineSignature = null;
  // Arrival refreshes markers/outlines after its write resolves; avoid starting
  // a second detail load and GPU update from the same storage notification.
  if (arrivalInProgressId !== null) return;
  updateDestinationOutlines();
});
window.addEventListener('sensor-storage-error', () => {
  showToast(currentLang === 'ja'
    ? '保存処理に問題が発生しました。再読み込みしてください。既存データは保持されています。'
    : 'Storage failed. Please reload. Existing data has been retained.');
});
applyLanguage(currentLang);
if (window.sensorStorageError) window.dispatchEvent(new Event('sensor-storage-error'));
window.SensorRuntimeDiagnostics?.setSnapshotProvider(() => ({
  tracking: appState.isTracking, paused: appState.isPaused, searching: isSearchInProgress,
  locationHistoryEntries: appState.locationHistory.length,
  geometryCacheEntries: requestDestinationGeometry.state?.cache.size || 0,
  geometryQueueEntries: requestDestinationGeometry.state?.queue.length || 0,
  audioState: audioCtx?.state || 'none', soundMode: appState.soundMode,
  silentAudioPlaying: Boolean(silentAudioElement && !silentAudioElement.paused)
}));
function beginExplorationRecovery(phase) {
  appState.explorationId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  appState.explorationStartedAt = Date.now();
  appState.explorationPhase = phase;
}

window.SensorExplorationRecovery = window.SensorExplorationResume.create({
  access: window.SensorRewardAds,
  blocked: () => rewardedSearchPending || appState.accessCommitPending,
  completed: () => loadSavedData().completedExplorationIds || [],
  validateGeometry: validDestinationGeometry,
  validateChallenge: id => CHALLENGES.some(challenge => challenge.id === id),
  onError: () => showToast(currentLang === 'ja'
    ? '探索状態を保存できません。再起動後に再開できない場合があります。'
    : 'Unable to save exploration. Recovery after a restart may be unavailable.'),
  capture: () => {
    if (!appState.isTracking || !appState.explorationId) return null;
    const places = [...appState.places];
    for (const target of [appState.randomTarget, appState.pinpointTarget]) {
      if (target && !places.some(place => place.id === target.id)) places.push(target);
    }
    const cache = requestDestinationGeometry.state?.cache;
    return {schema:1,id:appState.explorationId,startedAt:appState.explorationStartedAt,
      keyword:appState.activeKeyword,radius:RADIUS_OPTIONS[radiusIndex],targetMode:appState.targetMode,
      sensorDetail:appState.sensorDetail,phase:appState.explorationPhase,paused:appState.isPaused,
      challengeId:appState.activeChallenge?.id || null,challengeSettings:appState.challengeSettings,
      places,searchOrigin:appState.lastSearchedPos,randomTargetOrigin:appState.randomTargetOrigin,
      randomTargetArrivalFallback:appState.randomTargetArrivalFallback,
      randomTargetId:appState.randomTarget?.id,pinpointTargetId:appState.pinpointTarget?.id,
      detailsResolvedIds:places.filter(place => {
        const entry = cache?.get(`${currentLang}:${place.id}`);
        return entry?.done && !entry.failed;
      }).map(place => place.id)};
  }
});

function restoreExploration(snapshot) {
  resetKeywordSearch();
  appState.explorationId = snapshot.id;
  appState.explorationStartedAt = snapshot.startedAt;
  appState.explorationPhase = snapshot.phase;
  appState.activeKeyword = snapshot.keyword;
  appState.targetMode = snapshot.targetMode;
  appState.sensorDetail = snapshot.sensorDetail;
  radiusIndex = RADIUS_OPTIONS.indexOf(snapshot.radius);
  appState.activeChallenge = CHALLENGES.find(challenge => challenge.id === snapshot.challengeId) || null;
  appState.challengeSettings = snapshot.challengeSettings;
  appState.challengeCategories = appState.activeChallenge ? challengeCategoriesForGroup(appState.activeChallenge.group) : null;
  appState.places = snapshot.places;
  appState.randomTarget = snapshot.places.find(place => place.id === snapshot.randomTargetId) || null;
  appState.pinpointTarget = snapshot.places.find(place => place.id === snapshot.pinpointTargetId) || null;
  appState.randomTargetOrigin = snapshot.randomTargetOrigin;
  appState.randomTargetArrivalFallback = snapshot.randomTargetArrivalFallback;
  const ready = snapshot.phase === 'ready';
  appState.lastSearchedPos = ready ? snapshot.searchOrigin : null;
  initialSearchAccessGranted = !ready;
  const state = requestDestinationGeometry.state ||= {cache:new Map(),queue:[],running:0};
  for (const id of snapshot.detailsResolvedIds) {
    const place = snapshot.places.find(item => item.id === id);
    state.cache.set(`${currentLang}:${id}`, {done:true,targets:new Set(),geometry:place.geometry || null,
      metadata:null,expires:Date.now() + GEOAPIFY_CACHE_TTL_MS});
  }
  const input = document.getElementById('keyword-input');
  input.value = snapshot.keyword;
  input.readOnly = input.disabled = Boolean(appState.activeChallenge);
  appState.isTracking = true;
  appState.isPaused = snapshot.paused;
  updateRadiusAccess();
  updateConditionButtons();
  updateButtonStateUI();
  checkMainInputClearState();
  document.getElementById('target-meta-info').textContent = appState.pinpointTarget
    ? I18N[currentLang].targetMetaPinpoint(appState.pinpointTarget.name)
    : I18N[currentLang].targetMeta(snapshot.keyword,getRadiusText(snapshot.radius));
  renderChallenges();
  navigateToMain();
  window.SensorExplorationRecovery.checkpoint();
  if (!ready) executeSearch();
  evaluateSensorCycle();
}

function offerExplorationRecovery(snapshot) {
  const ja = currentLang === 'ja';
  const dialog = document.getElementById('exploration-resume-dialog');
  document.getElementById('exploration-resume-title').textContent = ja ? '再開しますか？' : 'Resume?';
  const challenge = CHALLENGES.find(item => item.id === snapshot.challengeId);
  const label = challenge ? challengeName(challenge) : snapshot.keyword;
  document.getElementById('exploration-resume-details').textContent = ja
    ? `${challenge ? 'チャレンジ' : '探索'}「${label}」`
    : `${challenge ? 'Challenge' : 'Search'} “${label}”`;
  const accept = document.getElementById('exploration-resume-accept');
  const discard = document.getElementById('exploration-resume-discard');
  accept.textContent = ja ? '再開する' : 'Resume';
  discard.textContent = ja ? '終了する' : 'End';
  accept.onclick = () => { dialog.close(); restoreExploration(snapshot); };
  discard.onclick = () => { window.SensorExplorationRecovery.clear(); dialog.close(); };
  dialog.oncancel = event => event.preventDefault();
  dialog.showModal();
}
window.addEventListener('pagehide', () => window.SensorExplorationRecovery.checkpoint());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) window.SensorExplorationRecovery.checkpoint();
});

function initializeOnLoad() {
  if (startupRefreshPending) return;
  bootstrapMapAndLocation();
  checkAndShowStartupModals();
}
if (document.readyState === 'complete') {
  initializeOnLoad();
} else {
  window.addEventListener('load', initializeOnLoad, { once: true });
}

