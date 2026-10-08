/**
 * ============================================================
 * [JavaScript Version Management Specification]
 * - 採番形式: v0.[Year].[Month]1.[DateHourMinute]
 * - 日時: 日本時間（Asia/Tokyo、UTC+09:00）。Yearは西暦下2桁、Monthはゼロ埋めなし。
 * - 更新方法: node scripts/update-js-version.cjs（実行環境のタイムゾーンに依存しない）
 * ============================================================
 */
const BASE_JS_VERSION = "v0.26.101.081906";
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
        line('highway-fill', major, day ? '#f0e3bc' : '#142433', majorWidth)
      ]
    };
  }

  function markerElement(day, opacity) {
    const element = document.createElement('div');
    element.className = 'osm-arrival-marker';
    element.innerHTML = day
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="#ffee33" stroke-width="2.5" opacity="${opacity}"/><circle cx="14" cy="14" r="13" fill="none" stroke="#6e5426" stroke-width="1.2" opacity="${opacity * 0.8}"/><circle cx="14" cy="14" r="4.5" fill="#ffee33" opacity="${opacity}"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="8" fill="#00f3ff" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="2" stroke-opacity="${opacity}"/></svg>`;
    return element;
  }

  function createMap(container, position, mode, statusElement) {
    let theme = mode;
    let styleReady = false;
    const instance = new global.maplibregl.Map({
      container, style: createStyle(mode), center: [position.lng, position.lat],
      // MapLibre uses 512px tiles; Google zoom 17 has the same scale as zoom 16.
      zoom: 16, interactive: false, attributionControl: false
    });
    if (statusElement) {
      instance.on('error', () => { statusElement.hidden = false; });
      instance.on('sourcedata', event => {
        if (event.sourceId === 'openmaptiles' && event.sourceDataType === 'content' &&
            instance.areTilesLoaded()) statusElement.hidden = true;
      });
    }
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(instance.getContainer());
    function repaintTheme() {
      createStyle(theme).layers.forEach(layer => {
        Object.entries(layer.paint).forEach(([property, value]) =>
          instance.setPaintProperty(layer.id, property, value));
      });
    }
    instance.once('load', () => {
      styleReady = true;
      if (theme !== mode) repaintTheme();
    });
    return {
      setCenter: position => instance.setCenter([position.lng, position.lat]),
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
      remove() { resizeObserver.disconnect(); instance.remove(); }
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
  const labels = [...document.querySelectorAll(
    '#label-sound-state, #label-wake-state, #label-continuous-state, .volume-label, .condition-label'
  )];
  const toasts = [...document.querySelectorAll('.sound-mode-toast, #toast-text')];
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


(function() {
  const metaTag = document.querySelector('meta[name="html-rev"]');
  const htmlRev = metaTag ? metaTag.getAttribute('content') : "11";

  const computedStyle = getComputedStyle(document.documentElement);
  let cssRev = computedStyle.getPropertyValue('--css-rev').trim().replace(/['"]/g, '');
  if (!cssRev) cssRev = "07";

  const fullVersion = `${BASE_JS_VERSION}.${htmlRev}.${cssRev}`;
  
  document.querySelectorAll('.app-build-ver-span').forEach(el => {
    el.textContent = fullVersion;
  });
})();

function initializeNavigationSystem() {
  const metaTag = document.querySelector('meta[name="html-rev"]');
  const htmlRev = metaTag ? metaTag.getAttribute('content') : "11";

  const computedStyle = getComputedStyle(document.documentElement);
  let cssRev = computedStyle.getPropertyValue('--css-rev').trim().replace(/['"]/g, '');
  if (!cssRev) cssRev = "07";

  const fullVersion = `${BASE_JS_VERSION}.${htmlRev}.${cssRev}`;

  document.querySelectorAll('.app-build-ver-span').forEach(el => {
    el.textContent = fullVersion;
  });

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

window.addEventListener('error', function(event) {
  if (event.filename && !event.filename.includes(location.hostname) && !event.filename.startsWith('/')) {
    return;
  }
  const errorMsg = `エラー発生: ${event.message} (${event.filename}:${event.lineno})`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(errorMsg).catch(() => {});
  }
  alert("エラー発生。ログをクリップボードにコピーしました。\n" + errorMsg);
});

const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

if (isStandaloneMode && !sessionStorage.getItem('sheikah_pwa_refreshed')) {
  sessionStorage.setItem('sheikah_pwa_refreshed', 'true');
  if ('caches' in window) {
    caches.keys().then((names) => {
      Promise.all(names.map(name => caches.delete(name))).then(() => {
        window.location.reload(true);
      });
    }).catch(() => {
      window.location.reload(true);
    });
  } else {
    window.location.reload(true);
  }
}

const CACHE_CHECK_KEY = 'sheikah_last_cache_time';
const nowTime = Date.now();
const lastCacheTime = parseInt(localStorage.getItem(CACHE_CHECK_KEY) || '0', 10);
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

if (!lastCacheTime) {
  localStorage.setItem(CACHE_CHECK_KEY, nowTime.toString());
} else if (nowTime - lastCacheTime > TWENTY_FOUR_HOURS) {
  localStorage.setItem(CACHE_CHECK_KEY, nowTime.toString());
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (let name of names) {
        caches.delete(name);
      }
    }).catch(() => {});
  }
  window.location.reload(true);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
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
    const storedTime = parseInt(localStorage.getItem(CACHE_CHECK_KEY) || '0', 10);
    if (Date.now() - storedTime > TWENTY_FOUR_HOURS) {
      localStorage.setItem(CACHE_CHECK_KEY, Date.now().toString());
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (let name of names) {
            caches.delete(name);
          }
        }).catch(() => {});
      }
      window.location.reload(true);
      return;
    }

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
    soundModeSpeakerDesc: "スピーカーモード：消音モードでも探知音を再生します。音楽などは停止する場合があります。",
    soundModeMutedDesc: "サウンドOFF：探知音を再生しません。",
    wakeLockOn: "KEEP SCREEN ON",
    wakeLockOff: "KEEP SCREEN OFF",
    wakeLockOnDesc: "画面ON：使用中は画面が自動で消えないようにします。",
    wakeLockOffDesc: "画面OFF：端末の設定に従って画面が自動で消えます。",
    continuousSearch: "CONTINUOUS",
    stopOnArrival: "STOP ON ARRIVAL",
    continuousSearchDesc: "連続探索：到達後も探索を継続し、次の未踏スポットを探します。",
    stopOnArrivalDesc: "到達時終了：スポットに到達すると探索を終了します。",
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
    sortHName: "名称あいうえお順",
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
    soundModeSpeakerDesc: "Speaker mode: Detection sounds play even in Silent Mode. Music or other audio may stop.",
    soundModeMutedDesc: "Sound off: Detection sounds will not play.",
    wakeLockOn: "KEEP SCREEN ON",
    wakeLockOff: "KEEP SCREEN OFF",
    wakeLockOnDesc: "Keep screen on: Prevents the screen from turning off automatically while in use.",
    wakeLockOffDesc: "Keep screen off: Allows the screen to turn off according to your device settings.",
    continuousSearch: "CONTINUOUS",
    stopOnArrival: "STOP ON ARRIVAL",
    continuousSearchDesc: "Continuous search: Keeps searching for the next undiscovered spot after arrival.",
    stopOnArrivalDesc: "Stop on arrival: Ends the search when you reach a spot.",
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
    sortHName: "Alphabetical",
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
    markersList.push(map.addMarker(item, currentMapStyleMode === 'botw',
      Math.max(0.15, 1.0 - index * 0.09), item.name));
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function applyLanguage(lang) {
  currentLang = lang;
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
  document.getElementById('opt-asort-near').textContent = t.sortHNear;
  document.getElementById('opt-asort-desc').textContent = t.sortHDesc;
  document.getElementById('opt-asort-asc').textContent = t.sortHAsc;
  document.getElementById('opt-asort-name').textContent = t.sortHName;
  document.getElementById('toast-title').textContent = t.discoveryCompleted;
  document.getElementById('label-lang-switch').textContent = t.langSwitchLabel;

  document.getElementById('pwa-prompt-title').textContent = t.pwaTitle;
  document.getElementById('pwa-prompt-desc').textContent = t.pwaDesc;
  document.getElementById('pwa-step-1').textContent = t.pwaStep1;
  document.getElementById('pwa-step-2').textContent = t.pwaStep2;
  document.getElementById('pwa-step-3').textContent = t.pwaStep3;
  document.getElementById('btn-pwa-skip').textContent = t.pwaSkip;
  document.getElementById('pwa-lang-label').textContent = t.langSwitchLabel;

  document.getElementById('safety-prompt-title').textContent = t.safetyTitle;
  document.getElementById('safety-prompt-desc').textContent = t.safetyDesc;
  document.getElementById('btn-safety-ok').textContent = t.safetyOk;
  document.getElementById('safety-lang-label').textContent = t.langSwitchLabel;
  updateCompassStatus();

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

function triggerDataTransferPrompt() {
  const db = loadSavedData();
  const jsonStr = JSON.stringify(db);
  const base64Code = btoa(unescape(encodeURIComponent(jsonStr)));

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
        const restoredJson = decodeURIComponent(escape(atob(inputCode.trim())));
        const restoredDb = JSON.parse(restoredJson);
        if (restoredDb && restoredDb.arrivals) {
          saveAppData(restoredDb);
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

function initAudio() {
  appState.isMuted = appState.soundMode === 'muted';

  // MUTEDでは音声系を起動しない。
  // playback状態から切り替わった場合もtransientへ戻す。
  if (appState.isMuted) {
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

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
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
  if (audioCtx.state === 'suspended') audioCtx.resume();

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.05, audioCtx.currentTime + duration * 0.7);

    gain.gain.setValueAtTime(0.55 * (appState.soundVolume / 7), audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playDoubleBeep() {
  if (appState.isMuted) return;
  playBeep(2300, 0.07);
  setTimeout(() => {
    playBeep(2450, 0.07);
  }, 85);
}

function playTreasureFanfare() {
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 300, 100, 600]);
  }

  if (appState.isMuted) return;
  if (!audioCtx) initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const notes = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50, 1174.66, 1318.51];
  notes.forEach((freq, idx) => {
    setTimeout(() => {
      if (appState.isMuted || !audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      const dur = (idx === notes.length - 1) ? 1.5 : 0.18;
      gain.gain.setValueAtTime(0.55 * (appState.soundVolume / 7), audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    }, idx * 115);
  });
}

const CHALLENGE_GROUPS = [
  { id: 'gourmet', ja: 'グルメ', en: 'Gourmet', categories: ['catering.restaurant', 'catering.cafe', 'catering.fast_food', 'catering.bar'] },
  { id: 'life', ja: 'ライフ', en: 'Life', categories: ['commercial.supermarket', 'commercial.convenience', 'public_transport', 'tourism.sights.city_hall', 'leisure.park'] },
  { id: 'leisure', ja: 'レジャー', en: 'Leisure', categories: ['entertainment.theme_park', 'entertainment.zoo', 'entertainment.aquarium', 'beach', 'entertainment.water_park'] },
  { id: 'deep', ja: 'ディープ', en: 'Deep', categories: ['tourism.sights.castle', 'tourism.sights.ruines', 'tourism.sights.archaeological_site'] },
  { id: 'secret', ja: 'シークレット', en: 'Secret', categories: [] }
];
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

let savedSoundVolume = parseInt(localStorage.getItem('sheikah_sound_volume') || '7', 10);
if (isNaN(savedSoundVolume) || savedSoundVolume < 1 || savedSoundVolume > 10) {
  savedSoundVolume = 7;
}

let savedWakeLockActive = localStorage.getItem('sheikah_wake_lock');
if (savedWakeLockActive === null) {
  savedWakeLockActive = true;
} else {
  savedWakeLockActive = savedWakeLockActive === 'true';
}

let appState = {
  isTracking: false,
  isPaused: false,
  soundMode: savedSoundMode,
  isMuted: savedSoundMode === 'muted',
  wakeLockActive: savedWakeLockActive,
  soundVolume: savedSoundVolume,
  continuousSearch: true,
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
let compassActive = false;
let compassPermissionPending = false;

let isSearchInProgress = false;
let searchGeneration = 0;
let arrivalInProgressId = null;
let detailMinimapInstance = null;

function loadSavedData() {
  const data = localStorage.getItem('sheikah_db_v1');
  if (data) return JSON.parse(data);
  return { keywordHistory: {}, arrivals: [] };
}

function saveAppData(db) {
  localStorage.setItem('sheikah_db_v1', JSON.stringify(db));
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
  if (!map) return;
  const position = { lat: coords.latitude, lng: coords.longitude };
  if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return;
  const accuracy = Number.isFinite(coords.accuracy) ? Math.max(0, coords.accuracy) : 10;
  // Hold the display when the GPS uncertainty becomes too large.
  if (accuracy > 50) {
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
  const moving = appState.isWalking || (Number.isFinite(speed) && speed > 0.4);
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
  const expectedTravel = Number.isFinite(speed) ? Math.max(0, speed) * elapsed : (moving ? 2 * elapsed : 0);
  const jumpThreshold = Math.max(15, accuracy + lastMapPositionFix.accuracy + expectedTravel * 3);
  if (distance > jumpThreshold) {
    const candidate = mapPositionJump;
    const confirmationRadius = Math.max(3, Math.min(10, accuracy * 0.4));
    if (!candidate || now - candidate.time > 5000 ||
        getDistance(candidate.lat, candidate.lng, position.lat, position.lng) > confirmationRadius) {
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
  if (travelSpeed >= 5 && travelSpeed <= 120 && heading !== null && elapsed > 0 && elapsed <= 5) {
    mapCenterMotion = {
      speed: travelSpeed, heading, startedAt: performance.now(),
      horizon: Math.max(1, Math.min(3, elapsed * 1.5))
    };
  }
  lastMapPositionFix = { ...position, accuracy, time: now };
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
  initMap(lastKnownPos.lat, lastKnownPos.lng);
  updateMapStyleUI();

  if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      onPositionUpdate,
      (err) => {
        console.warn("位置情報監視エラー:", err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );
  }
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

const CANDIDATE_REFRESH_MS = 5 * 60 * 1000;
let candidateRefreshTimer = null;

function scheduleCandidateRefresh() {
  clearTimeout(candidateRefreshTimer);
  candidateRefreshTimer = setTimeout(() => {
    candidateRefreshTimer = null;
    if (!appState.isTracking || appState.pinpointTarget) return;
    scheduleCandidateRefresh();
    executeSearch(true);
  }, CANDIDATE_REFRESH_MS);
}

function resetKeywordSearch() {
  clearTimeout(candidateRefreshTimer);
  candidateRefreshTimer = null;
  searchGeneration++;
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

function getSearchCandidates() {
  if (!appState.currentPos) return [];
  const db = loadSavedData();
  const radius = RADIUS_OPTIONS[radiusIndex];
  const mutedIds = new Set(db.arrivals.filter(item => item.muted).map(item => item.id));
  return appState.places.filter(place => !mutedIds.has(place.id) &&
    getDistance(appState.currentPos.lat, appState.currentPos.lng, place.lat, place.lng) <= radius);
}

function chooseSearchTarget(origin = appState.lastSearchedPos || appState.currentPos) {
  const candidates = getSearchCandidates();
  if (appState.targetMode === 'all' || !candidates.length) {
    appState.randomTarget = null;
  } else if (appState.targetMode === 'nearest') {
    appState.randomTarget = candidates.reduce((nearest, place) =>
      getDistance(origin.lat, origin.lng, place.lat, place.lng) <
      getDistance(origin.lat, origin.lng, nearest.lat, nearest.lng) ? place : nearest);
  } else {
    appState.randomTarget = candidates[Math.floor(Math.random() * candidates.length)];
  }
}

function maintainSearchTarget() {
  if (appState.targetMode === 'all') {
    appState.randomTarget = null;
    return;
  }
  if (!appState.randomTarget || !getSearchCandidates().some(place => place.id === appState.randomTarget.id)) {
    chooseSearchTarget();
  }
}

function sensorReaction(distance, angle) {
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
  const locked = appState.isTracking && !appState.isPaused &&
    appState.targetMode !== 'all' && Boolean(appState.pinpointTarget || appState.randomTarget);
  label.textContent = locked ? I18N[currentLang].detectingLocked : I18N[currentLang].detecting;
}

function evaluateSensorCycle() {
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

  if (!appState.pinpointTarget) maintainSearchTarget();
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
    (appState.targetMode === 'all' ? getSearchCandidates() : []);

  // The count represents all eligible places in either locked or all-target mode.
  countEl.textContent = appState.pinpointTarget ? 1 : getSearchCandidates().length;
  updateDetectionLabel();

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
  const arrival = readings.filter(reading => reading.distance <= 20)
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
  if (radarTimer && scheduledInterval === interval) {
    return;
  }

  if (radarTimer) clearTimeout(radarTimer);
  scheduledInterval = interval;

  function pulse() {
    if (!appState.isTracking || appState.isPaused) {
      radarTimer = null;
      scheduledInterval = null;
      return;
    }

    if (isDoubleBeep) {
      playDoubleBeep();
    } else {
      playBeep(interval <= 900 ? 2100 : 1750);
    }

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

function handleArrival(target) {
  if (arrivalInProgressId !== null) return;
  arrivalInProgressId = target.id;
  const flash = document.getElementById('arrival-flash-overlay');
  if (flash) {
    flash.classList.remove('flash-anim');
    void flash.offsetWidth;
    flash.classList.add('flash-anim');
  }

  playTreasureFanfare();

  const db = loadSavedData();
  const now = new Date().toISOString();

  updateArrivalRecordWithDetails(db, target, now);
}

function updateArrivalRecordWithDetails(db, target, now) {
  arrivalInProgressId = null;
  const existing = db.arrivals.find(a => a.id === target.id);
  if (!existing) {
    db.arrivals.push({
      id: target.id, name: target.name, keyword: appState.activeKeyword,
      lat: target.lat, lng: target.lng, date: now, muted: true,
      formatted_address: target.formatted_address || '',
      phone: target.phone || null, website: target.website || null
    });
  } else {
    existing.muted = true;
    if (target.formatted_address) existing.formatted_address = target.formatted_address;
  }

  if (!db.keywordHistory[appState.activeKeyword]) {
    db.keywordHistory[appState.activeKeyword] = { lastSearch: now, lastArrival: now };
  } else {
    db.keywordHistory[appState.activeKeyword].lastArrival = now;
  }
  const challenge = appState.activeChallenge;
  if (challenge) {
    db.completedChallenges = [...new Set([...(db.completedChallenges || []), challenge.id])];
    const arrival = db.arrivals.find(item => item.id === target.id);
    arrival.challengeIds = [...new Set([...(arrival.challengeIds || []), challenge.id])];
  }
  saveAppData(db);

  redrawMarkersWithFade();

  const t = I18N[currentLang];
  const toast = document.getElementById('toast-banner');
  document.getElementById('toast-text').textContent = t.toastRecorded(target.name);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 5000);

  if (challenge) {
    document.getElementById('toast-text').textContent = currentLang === 'ja'
      ? `${challengeName(challenge)}クリア！ ${target.name}への到達を記録しました。`
      : `${challengeName(challenge)} completed! Arrival at ${target.name} recorded.`;
    stopSearchAndReset();
    document.getElementById('keyword-input').value = '';
    checkMainInputClearState();
    renderChallenges();
    openChallengeArrivals(challenge);
    return;
  }

  if (!appState.continuousSearch) {
    appState.pinpointTarget = null;
    stopSearchAndReset();
    return;
  }

  appState.pinpointTarget = null;
  resetKeywordSearch();
  executeSearch();
  evaluateSensorCycle();

  setTimeout(() => {
    evaluateSensorCycle();
  }, 1500);
}

let mapRotationFrame = null;
let mapRotationTarget = 0;
let lastCompassEvaluationTime = -Infinity;

function rotateMapSmoothly(targetBearing) {
  const mapDiv = document.getElementById('map');
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
  }
  mapRotationFrame = requestAnimationFrame(animateRotation);
}

// Compare angles across north without treating 359° → 1° as a full turn.
function headingDelta(target, current) {
  return (((target - current + 180) % 360 + 360) % 360) - 180;
}

function enterStoppedState() {
  appState.isWalking = false;
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
  const minSpeed = appState.isWalking ? 0.8 : 1.2;
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

  if (heading === null) {
    appState.movementCandidate = null;
    return null;
  }
  heading = (heading % 360 + 360) % 360;
  if (!appState.isWalking) {
    const candidate = appState.movementCandidate;
    if (!candidate || now - candidate.lastTime > 4000 ||
        Math.abs(headingDelta(heading, candidate.heading)) > 45) {
      appState.movementCandidate = { heading, since: now, lastTime: now };
      return null;
    }
    candidate.lastTime = now;
    if (now - candidate.since < 2000) return null;
    appState.isWalking = true;
  }
  appState.lastWalkTimestamp = now;
  return heading;
}

function onDeviceOrientation(e) {
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
  // Keep the compass filter warm during movement for a quick handoff at stops.
  if (appState.isWalking) return;
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
  const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
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

  if (appState.isTracking && !appState.isPaused && !appState.pinpointTarget &&
      !appState.lastSearchedPos) {
    executeSearch();
  }

  evaluateSensorCycle();
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

async function fetchGeoapify(path, parameters) {
  const url = new URL(path, 'https://api.geoapify.com');
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));
  url.searchParams.set('apiKey', getGeoapifyApiKey());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error('Invalid search response');
    return data.features;
  } finally {
    clearTimeout(timer);
  }
}

async function searchGeoapify(text, position, radius, language, forcedCategories = null) {
  getGeoapifyApiKey();
  const common = {
    filter: `circle:${position.lng},${position.lat},${radius}`,
    bias: `proximity:${position.lng},${position.lat}`, lang: language
  };
  const requests = forcedCategories ? [] : [fetchGeoapify('/v1/geocode/search', { ...common, text, limit: 20 })];
  const categories = forcedCategories || categoriesForKeyword(text);
  if (categories.length) requests.push(fetchGeoapify('/v2/places', {
    ...common, categories: categories.join(','), limit: 100
  }));
  const responses = await Promise.allSettled(requests);
  const successful = responses.filter(result => result.status === 'fulfilled');
  if (!successful.length) throw new Error('Search unavailable');
  const places = new Map();
  for (const result of successful) for (const feature of result.value) {
    const p = feature.properties || {};
    const lat = p.lat ?? feature.geometry?.coordinates?.[1];
    const lng = p.lon ?? feature.geometry?.coordinates?.[0];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (getDistance(position.lat, position.lng, lat, lng) > radius) continue;
    const name = p.name || p.address_line1 || p.formatted;
    if (!name) continue;
    const id = p.place_id || `geo:${lat}:${lng}:${name}`;
    const previous = places.get(id);
    places.set(id, {
      id, name, lat, lng, formatted_address: p.formatted || previous?.formatted_address || '',
      phone: p.contact?.phone || previous?.phone || null,
      website: p.website || previous?.website || null
    });
  }
  return {
    places: [...places.values()].sort((a, b) =>
      getDistance(position.lat, position.lng, a.lat, a.lng) - getDistance(position.lat, position.lng, b.lat, b.lng)),
    partial: successful.length !== responses.length
  };
}

async function executeSearch(refreshCandidates = false) {
  if (!appState.isTracking || appState.isPaused || !appState.currentPos || isSearchInProgress ||
      appState.pinpointTarget || (!refreshCandidates && appState.randomTarget) || !appState.activeKeyword) return;
  scheduleCandidateRefresh();
  const generation = searchGeneration;
  isSearchInProgress = true;
  const position = { ...appState.currentPos };
  appState.lastSearchedPos = position;
  const radius = RADIUS_OPTIONS[radiusIndex];
  const rText = radius >= 1000 ? `${radius / 1000}km` : `${radius}m`;
  document.getElementById('target-meta-info').textContent = I18N[currentLang].targetMeta(appState.activeKeyword, rText);
  try {
    const result = await searchGeoapify(appState.activeKeyword.trim(), position, radius, currentLang, appState.challengeCategories);
    if (generation !== searchGeneration || !appState.isTracking) return;
    if (result.partial) console.warn('One search source is unavailable; using available results.');
    appState.places = result.places;
    const fixedTarget = refreshCandidates ? appState.randomTarget : null;
    if (fixedTarget && !appState.places.some(place => place.id === fixedTarget.id)) appState.places.push(fixedTarget);
    const retained = fixedTarget && getSearchCandidates().find(place => place.id === fixedTarget.id);
    if (retained) appState.randomTarget = retained;
    else chooseSearchTarget(position);
  } catch (error) {
    if (generation !== searchGeneration || !appState.isTracking) return;
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
      evaluateSensorCycle();
    }
  }
}

function showConditionToast(message) {
  hideOtherSettingToasts('condition-mode-toast');
  const toast = document.getElementById('condition-mode-toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(conditionToastTimer);
  conditionToastTimer = setTimeout(() => toast.classList.remove('show'), 4500);
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
  appState.continuousSearch = saved.continuousSearch;
  radiusIndex = saved.radiusIndex;
  document.getElementById('keyword-input').readOnly = false;
  document.getElementById('continuous-toggle-btn').setAttribute('aria-disabled', 'false');
  document.getElementById('continuous-toggle-btn').classList.remove('feature-locked');
  applyFeatureAccess();
  renderChallenges();
}

function startChallenge(challenge) {
  if (!isChallengeAvailable(challenge)) return;
  stopSearchAndReset();
  appState.challengeSettings = { targetMode: appState.targetMode, sensorDetail: appState.sensorDetail,
    continuousSearch: appState.continuousSearch, radiusIndex };
  appState.activeChallenge = challenge;
  let categories = CHALLENGE_GROUPS.find(g => g.id === challenge.group).categories;
  if (challenge.group === 'secret') {
    const all = CHALLENGE_GROUPS.flatMap(g => g.categories);
    categories = [all[Math.floor(Math.random() * all.length)]];
  }
  appState.challengeCategories = [...categories];
  appState.targetMode = challenge.mode;
  appState.sensorDetail = challenge.sensor;
  appState.continuousSearch = false;
  radiusIndex = RADIUS_OPTIONS.indexOf(challenge.radius);
  const input = document.getElementById('keyword-input');
  input.value = challengeName(challenge);
  input.readOnly = true;
  document.getElementById('continuous-toggle-btn').setAttribute('aria-disabled', 'true');
  document.getElementById('continuous-toggle-btn').classList.add('feature-locked');
  checkMainInputClearState();
  updateRadiusAccess();
  startSearchFromSet(true);
  renderChallenges();
  navigateToMain();
}

let pendingChallenge = null;
function requestChallengeStart(challenge) {
  if (!isChallengeAvailable(challenge)) return;
  pendingChallenge = challenge;
  const ja = currentLang === 'ja';
  const dialog = document.getElementById('challenge-start-dialog');
  dialog.returnValue = '';
  document.getElementById('challenge-start-question').textContent = ja
    ? 'チャレンジを開始しますか？' : 'Start this challenge?';
  document.getElementById('challenge-start-name').textContent = challengeName(challenge) +
    (appState.isTracking ? (ja ? '（現在の探索は終了します）' : ' (the current search will end)') : '');
  document.getElementById('challenge-start-yes').textContent = ja ? 'はい' : 'Yes';
  document.getElementById('challenge-start-no').textContent = ja ? 'いいえ' : 'No';
  dialog.showModal();
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
  document.getElementById('challenge-arrivals-title').textContent = currentLang === 'ja' ? '到達スポット一覧' : 'Arrived spots';
  document.getElementById('challenge-arrivals-name').textContent = challengeName(challenge);
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
      openSpotDetailModal(item);
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
  document.getElementById('challenge-help').textContent = ja
    ? '指定カテゴリの対象に20m以内まで近づくとクリア。メインのSETで一時停止・再開できます。停止・終了後は、この画面から再度SETしてください。'
    : 'Reach a target within 20m to complete. Use SET on the main screen to pause/resume. After stopping, SET a challenge here to start again.';
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
    row.className = 'challenge-milestone' + (count >= required ? ' achieved' : '');
    row.textContent = `${count >= required ? '✓ ' : ''}${text}`;
    container.append(row);
  };
  for (const stage of CHALLENGE_STAGES) {
    for (const challenge of CHALLENGES.filter(c => c.stage === stage.id)) {
      const row = document.createElement('div');
      const available = isChallengeAvailable(challenge, progress);
      row.className = 'list-item challenge-row' + (available ? '' : ' challenge-locked');
      const content = document.createElement('div');
      content.className = 'list-item-row';
      const left = document.createElement('div');
      left.className = 'list-item-left';
      const title = document.createElement('span');
      title.className = 'list-item-title';
      title.textContent = challengeName(challenge);
      const status = document.createElement('div');
      status.className = 'list-item-sub';
      const group = CHALLENGE_GROUPS.find(g => g.id === challenge.group);
      const descriptions = ja ? {
        gourmet: '飲食店・カフェなど', life: 'スーパー・駅・市役所・公園など',
        leisure: '遊園地・海岸など', deep: '城跡・遺跡など', secret: '全カテゴリからランダムに指定'
      } : { gourmet: 'Restaurants and cafes', life: 'Supermarkets, stations, town halls and parks',
        leisure: 'Theme parks and beaches', deep: 'Castles and archaeological sites', secret: 'A random category from all groups' };
      row.title = descriptions[group.id];
      status.textContent = I18N[currentLang].arrivalCount(getChallengeArrivals(db, challenge).length) + ' · ' + (progress.completed.has(challenge.id)
        ? (ja ? 'クリア済み' : 'Completed') : available ? (ja ? '挑戦可能' : 'Available') : (ja ? '未開放' : 'Locked'));
      left.append(title, status);
      const button = document.createElement('button');
      button.className = 'btn-sheikah-sm challenge-set';
      button.textContent = 'SET';
      button.disabled = !available;
      button.setAttribute('aria-label', `${challengeName(challenge)} SET`);
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
      milestone(ja ? '1kmランダムチャレンジを1つクリアすると、ターゲットロックを切り替えられるようになります。' : 'Complete 1 × 1km Random, then unlock target lock switching', progress.random, 1);
      milestone(ja ? '1kmランダムチャレンジを3つクリアすると、3kmランダムチャレンジが開放されます。' : 'Complete 3 × 1km Random, then unlock 3km Random challenges', progress.random, 3);
      milestone(ja ? '1kmランダムチャレンジを5つクリアすると、高精度センサー（HI-SENS）が使えるようになります。' : 'Complete 5 × 1km Random, then unlock HI-SENS', progress.random, 5);
    } else {
      milestone(ja ? '3kmランダムチャレンジを1つクリアすると、検索範囲に10kmを選べるようになります。' : 'Complete 1 × 3km Random, then unlock 10km', progress.wide, 1);
      milestone(ja ? '3kmランダムチャレンジを3つクリアすると、検索範囲に50kmを選べるようになります。' : 'Complete 3 × 3km Random, then unlock 50km', progress.wide, 3);
      milestone(ja ? '15種類すべてのチャレンジをクリアすると、検索範囲に100kmを選べるようになります。' : 'Complete all challenges, then unlock 100km', progress.completed.size, 15);
    }
  }
}

function getRadiusText(r) {
  return r >= 1000 ? `${r/1000}km` : `${r}m`;
}

updateRadiusAccess();

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
  const t = I18N[currentLang];
  if (appState.isTracking) {
    if (!confirm(t.confirmEndSearch)) {
      return;
    }
    stopSearchAndReset();
  }
  keywordInputEl.value = '';
  checkMainInputClearState();
  keywordInputEl.blur();
});

keywordInputEl.addEventListener('focus', () => {
  if (appState.activeChallenge) return;
  if (appState.isTracking && keywordInputEl.value.trim() !== "") {
    const t = I18N[currentLang];
    if (confirm(t.confirmEndSearch)) {
      stopSearchAndReset();
      checkMainInputClearState();
    } else {
      keywordInputEl.blur();
    }
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

  const continuousIconLoop = document.getElementById('continuous-icon-loop');
  const continuousIconFlag = document.getElementById('continuous-icon-flag');
  const labelContinuous = document.getElementById('label-continuous-state');

  continuousIconLoop.classList.toggle('active', appState.continuousSearch);
  continuousIconFlag.classList.toggle('active', !appState.continuousSearch);
  labelContinuous.textContent = appState.continuousSearch
    ? t.continuousSearch
    : t.stopOnArrival;

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

function hideOtherSettingToasts(activeToastId) {
  const toastIds = [
    'condition-mode-toast',
    'sound-mode-toast',
    'volume-mode-toast',
    'continuous-mode-toast',
    'wake-mode-toast'
  ];

  toastIds.forEach((toastId) => {
    if (toastId === activeToastId) return;

    const toast = document.getElementById(toastId);
    if (toast) {
      toast.classList.remove('show');
    }
  });
}

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
  }, 2800);
}

document.getElementById('mute-toggle-btn').addEventListener('click', () => {
  const modes = ['headphone', 'speaker', 'muted'];
  const currentIndex = modes.indexOf(appState.soundMode);
  appState.soundMode = modes[(currentIndex + 1) % modes.length];
  appState.isMuted = appState.soundMode === 'muted';

  localStorage.setItem('sheikah_sound_mode', appState.soundMode);

  if (navigator.audioSession) {
    navigator.audioSession.type =
      appState.soundMode === 'speaker' ? 'playback' : 'transient';
  }

  if (!appState.isMuted) {
    initAudio();
    playBeep(2000, 0.08);
  }

  updateButtonStateUI();
  showSoundModeToast();
});

let volumeModeToastTimer = null;

function showVolumeModeToast() {
  const toast = document.getElementById('volume-mode-toast');
  if (!toast) return;

  hideOtherSettingToasts('volume-mode-toast');

  const bars = '■'.repeat(appState.soundVolume) + '□'.repeat(10 - appState.soundVolume);
  toast.textContent = `SOUND VOLUME　${bars}　${appState.soundVolume * 10}%`;
  toast.classList.add('show');

  if (volumeModeToastTimer) {
    clearTimeout(volumeModeToastTimer);
  }

  volumeModeToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    volumeModeToastTimer = null;
  }, 2800);
}

function changeSoundVolume(step) {
  if (appState.isMuted) return;

  const nextVolume = Math.max(1, Math.min(10, appState.soundVolume + step));
  if (nextVolume === appState.soundVolume) {
    showVolumeModeToast();
    return;
  }

  appState.soundVolume = nextVolume;
  localStorage.setItem('sheikah_sound_volume', String(appState.soundVolume));

  playBeep(2000, 0.08);
  showVolumeModeToast();
}

document.getElementById('volume-down-btn').addEventListener('click', () => {
  changeSoundVolume(-1);
});

document.getElementById('volume-up-btn').addEventListener('click', () => {
  changeSoundVolume(1);
});

let continuousModeToastTimer = null;

function showContinuousModeToast() {
  const toast = document.getElementById('continuous-mode-toast');
  if (!toast) return;

  hideOtherSettingToasts('continuous-mode-toast');

  const t = I18N[currentLang];
  toast.textContent = appState.continuousSearch
    ? t.continuousSearchDesc
    : t.stopOnArrivalDesc;

  toast.classList.add('show');

  if (continuousModeToastTimer) {
    clearTimeout(continuousModeToastTimer);
  }

  continuousModeToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    continuousModeToastTimer = null;
  }, 2800);
}

document.getElementById('continuous-toggle-btn').addEventListener('click', () => {
  if (appState.activeChallenge) {
    showConditionToast(currentLang === 'ja' ? 'チャレンジ中は到達時終了です。変更するにはチャレンジを停止してください。' : 'Challenges end on arrival. Stop the challenge to change this setting.');
    return;
  }
  appState.continuousSearch = !appState.continuousSearch;
  updateButtonStateUI();
  showContinuousModeToast();
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
    ? (appState.sensorDetail === 'standard' ? 'NORMAL SENS：通常の5段階で反応します' : 'HI-SENS：反応を9段階に細分化し、距離の変化を細かく伝えます')
    : (appState.sensorDetail === 'standard' ? 'NORMAL SENS: five reaction levels' : 'HI-SENS: nine reaction levels, with finer distance feedback');
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
        : (currentLang === 'ja' ? 'チャレンジ条件クリアで機能が開放されます' : 'Complete challenge requirements to unlock this feature.')));
      return;
    }
    const key = target ? 'targetMode' : 'sensorDetail';
    const modes = target ? ['nearest', 'random', 'all'] : ['standard', 'detailed'];
    appState[key] = modes[(modes.indexOf(appState[key]) + 1) % modes.length];
    localStorage.setItem(`sheikah_${target ? 'target_mode' : 'sensor_detail'}`, appState[key]);
    updateConditionButtons();
    hideOtherSettingToasts('condition-mode-toast');
    const toast = document.getElementById('condition-mode-toast');
    toast.textContent = conditionDescription(kind);
    toast.classList.add('show');
    clearTimeout(conditionToastTimer);
    conditionToastTimer = setTimeout(() => toast.classList.remove('show'), 4500);
    if (target && !appState.pinpointTarget) {
      resetKeywordSearch();
      executeSearch();
    }
    evaluateSensorCycle();
  });
}
updateConditionButtons();

function stopSearchAndReset() {
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

async function startSearchFromSet(fromChallenge = false) {
  if (appState.activeChallenge && !fromChallenge) {
    showToast(currentLang === 'ja' ? 'チャレンジを停止してから探索を変更してください。' : 'Stop the challenge before changing the search.');
    return;
  }
  initAudio();
  playBeep(2200);
  if (appState.wakeLockActive) requestWakeLock();

  const inputVal = document.getElementById('keyword-input').value.trim();
  if (!inputVal) {
    alert("キーワードを入力してください");
    return;
  }

  resetKeywordSearch();
  appState.activeKeyword = inputVal;
  appState.pinpointTarget = null;
  appState.isTracking = true;
  appState.isPaused = false;

  const db = loadSavedData();
  const now = new Date().toISOString();
  if (!db.keywordHistory[appState.activeKeyword]) {
    db.keywordHistory[appState.activeKeyword] = { lastSearch: now, lastArrival: null };
  } else {
    db.keywordHistory[appState.activeKeyword].lastSearch = now;
  }
  saveAppData(db);

  updateButtonStateUI();
  evaluateSensorCycle();

  if (!watchId && 'geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(onPositionUpdate, (err) => {
      document.getElementById('distance-info').textContent = "GPS Error: " + err.message;
    }, { 
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    });
  } else {
    executeSearch();
  }
}

document.getElementById('set-btn').addEventListener('click', () => {
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
const pageAllHistory = document.getElementById('page-all-history');

const fnavBtnChallenges = document.getElementById('fnav-btn-challenges');
const fnavBtnMain = document.getElementById('fnav-btn-main');
const fnavBtnHistory = document.getElementById('fnav-btn-history');
const fnavBtnAll = document.getElementById('fnav-btn-all');

function updateFooterActive(tabIndex) {
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
        onSwipeLeft();
      } else if (diffX > 0 && onSwipeRight) {
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
    const countA = db.arrivals.filter(item => item.keyword === a).length;
    const countB = db.arrivals.filter(item => item.keyword === b).length;

    if (sortType === 'recent_search') {
      return new Date(dataB.lastSearch || 0) - new Date(dataA.lastSearch || 0);
    } else if (sortType === 'recent_arrival') {
      return new Date(dataB.lastArrival || 0) - new Date(dataA.lastArrival || 0);
    } else if (sortType === 'count_desc') {
      return countB - countA;
    }
  });

  keys.forEach(k => {
    const count = db.arrivals.filter(item => item.keyword === k).length;
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div class="list-item-row">
        <div class="list-item-left">
          <span class="list-item-title">${k}</span>
          <div class="list-item-sub">${t.arrivalCount(count)}</div>
        </div>
        <div class="item-right-actions">
          <button class="btn-sheikah-sm btn-reset-search" data-key="${k}">SET</button>
          <div style="color: var(--sheikah-gold); font-size: 1.3rem;">▶</div>
        </div>
      </div>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-reset-search')) return;
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
    const count = db.arrivals.filter(item => item.keyword === k).length;
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

function renderHistoryList() {
  const db = loadSavedData();
  const container = document.getElementById('history-list-container');
  container.innerHTML = '';
  const t = I18N[currentLang];

  const filterText = document.getElementById('history-filter').value.toLowerCase();
  const sortType = document.getElementById('sort-history').value;

  let items = db.arrivals.filter(a => 
    a.keyword === appState.selectedKeywordForHistory &&
    a.name.toLowerCase().includes(filterText)
  );

  const basePos = appState.currentPos || lastKnownPos;
  if (basePos) {
    items.forEach(item => {
      item.calcDistance = getDistance(basePos.lat, basePos.lng, item.lat, item.lng);
    });
  }

  items.sort((a, b) => {
    if (sortType === 'near_asc') {
      return (a.calcDistance || Infinity) - (b.calcDistance || Infinity);
    } else if (sortType === 'date_desc') {
      return new Date(b.date) - new Date(a.date);
    } else if (sortType === 'date_asc') {
      return new Date(a.date) - new Date(b.date);
    } else if (sortType === 'name_asc') {
      return a.name.localeCompare(b.name, currentLang === 'ja' ? 'ja' : 'en');
    }
  });

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
        openSpotDetailModal(item);
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

  items.sort((a, b) => {
    if (sortType === 'near_asc') {
      return (a.calcDistance || Infinity) - (b.calcDistance || Infinity);
    } else if (sortType === 'date_desc') {
      return new Date(b.date) - new Date(a.date);
    } else if (sortType === 'date_asc') {
      return new Date(a.date) - new Date(b.date);
    } else if (sortType === 'name_asc') {
      return a.name.localeCompare(b.name, currentLang === 'ja' ? 'ja' : 'en');
    }
  });

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

      const div = document.createElement('div');
      div.className = 'list-item';
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
        openSpotDetailModal(item);
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
document.getElementById('sort-all-history').addEventListener('change', renderAllHistoryList);

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
  const toast = document.getElementById('toast-banner');
  document.getElementById('toast-text').textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function setPinpointTargetAndStart(item) {
  if (appState.activeChallenge) {
    showToast(currentLang === 'ja' ? 'チャレンジを停止してから探索を変更してください。' : 'Stop the challenge before changing the search.');
    return;
  }
  resetKeywordSearch();
  const t = I18N[currentLang];
  appState.pinpointTarget = {
    id: item.id,
    name: item.name,
    lat: item.lat,
    lng: item.lng
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
}

function openSpotDetailModal(item) {
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
  document.getElementById('detail-spot-keyword').textContent = t.targetKeywordLabel(item.keyword || '-');

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
    const savedItem = db.arrivals.find(arrival => arrival.id === item.id);
    if (savedItem) savedItem.muted = item.muted;
    saveAppData(db);
    updateDetailRadarBtn();
  };

  document.getElementById('detail-btn-delete-single').onclick = () => {
    if (confirm(t.confirmDeleteSingle(item.name))) {
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
    <div class="map-attribution detail-map-attribution">${SensorMap.attribution}</div>
    <div class="map-load-status detail-map-status" hidden>地図を読み込めません / Map unavailable</div>
  `;
  gallery.appendChild(mapWrap);

  // Render the saved coordinates without a detail API request.
  renderDetailMap(item, gallery, detailMapBox);


  document.getElementById('detail-spot-address').textContent = item.formatted_address || t.noAddress;
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
    detailMinimapInstance = SensorMap.createMap(mapContainer, item, currentMapStyleMode, statusElement);
    detailMinimapInstance.addMarker(item, currentMapStyleMode === 'botw', 1, item.name);
    mapContainer.dataset.initialized = 'true';
  } catch (error) {
    statusElement.hidden = false;
    console.warn('OSM detail map initialization failed:', error);
  }
}

document.getElementById('keyword-filter').addEventListener('input', renderKeywordsList);
document.getElementById('sort-keywords').addEventListener('change', renderKeywordsList);
document.getElementById('history-filter').addEventListener('input', renderHistoryList);
document.getElementById('sort-history').addEventListener('change', renderHistoryList);

function checkAndShowStartupModals() {
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

document.getElementById('btn-safety-ok').addEventListener('click', async () => {
  const compassPermission = requestCompassPermissionIfNeeded();
  document.getElementById('safety-prompt-overlay').classList.remove('show');
  initAudio();

  if (appState.wakeLockActive) {
    await requestWakeLock();
  }

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      onPositionUpdate,
      (err) => { console.warn("位置情報許可拒否またはエラー:", err.message); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  await compassPermission;
});

setInterval(updateCompassStatus, 500);

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
document.getElementById('challenge-start-dialog').addEventListener('cancel', () => {
  pendingChallenge = null;
});
applyLanguage(currentLang);
window.addEventListener('load', () => {
  bootstrapMapAndLocation();
  checkAndShowStartupModals();
});
