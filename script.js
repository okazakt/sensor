/**
 * ============================================================
 * [JavaScript Version Management Specification]
 * - 採番形式: v0.[Year].[Month]1.[DateHourMinute]
 * ============================================================
 */
const BASE_JS_VERSION = "v0.26.101.041520";

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
    mapsReviewPhotoBtn: "★ クチコミ・写真投稿",
    galleryHeader: "現地ギャラリー (Google Places)",
    loadingPhotos: "写真を取得中...",
    loadingAddress: "住所情報を照会中...",
    noAddress: "住所情報なし",
    noPhotosText: "Googleマップに登録された写真がありません。",
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
    mapsReviewPhotoBtn: "★ Post Review & Photo",
    galleryHeader: "Place Gallery (Google Places)",
    loadingPhotos: "Loading photos...",
    loadingAddress: "Querying address...",
    noAddress: "No address available",
    noPhotosText: "No photos found on Google Maps.",
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

const mapStyleSheikahDark = [
  { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { elementType: "geometry", stylers: [{ color: "#081018" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#142433" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#02070d" }] }
];

const mapStyleBotw = [
  { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { elementType: "geometry", stylers: [{ color: "#453820" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#483b23" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#3f331c" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#e4d5a8" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#2c2415" }, { weight: 1.2 }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#f0e3bc" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#221b0e" }, { weight: 1.5 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#38485c" }] }
];

let currentMapStyleMode = localStorage.getItem('sheikah_map_style') || 'botw';
let markersList = [];

function clearAllMarkers() {
  markersList.forEach(m => m.setMap(null));
  markersList = [];
}

function redrawMarkersWithFade() {
  if (!map) return;
  clearAllMarkers();

  const db = loadSavedData();
  if (!db.arrivals || db.arrivals.length === 0) return;

  const sortedArrivals = [...db.arrivals].sort((a, b) => new Date(b.date) - new Date(a.date));
  const isDay = (currentMapStyleMode === 'botw');

  sortedArrivals.forEach((item, index) => {
    if (index >= 10) return;

    const opacity = Math.max(0.15, 1.0 - (index * 0.09));

    let iconObj;
    if (isDay) {
      iconObj = {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
            <circle cx="14" cy="14" r="11" fill="none" stroke="#ffee33" stroke-width="2.5" opacity="${opacity}" />
            <circle cx="14" cy="14" r="13" fill="none" stroke="#6e5426" stroke-width="1.2" opacity="${opacity * 0.8}" />
            <circle cx="14" cy="14" r="4.5" fill="#ffee33" opacity="${opacity}" />
          </svg>
        `),
        scaledSize: new google.maps.Size(28, 28),
        anchor: new google.maps.Point(14, 14)
      };
    } else {
      iconObj = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#00f3ff",
        fillOpacity: opacity,
        strokeWeight: 2,
        strokeColor: "#ffffff",
        strokeOpacity: opacity
      };
    }

    const marker = new google.maps.Marker({
      position: { lat: item.lat, lng: item.lng },
      map: map,
      title: item.name,
      icon: iconObj
    });
    markersList.push(marker);
  });
}

function getMarkerIcon(isDayMode) {
  return getMarkerIconDynamic(isDayMode, 1.0);
}

function getMarkerIconDynamic(isDayMode, opacity) {
  if (isDayMode) {
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="11" fill="none" stroke="#ffee33" stroke-width="2.5" opacity="${opacity}" />
          <circle cx="14" cy="14" r="13" fill="none" stroke="#6e5426" stroke-width="1.2" opacity="${opacity * 0.8}" />
          <circle cx="14" cy="14" r="4.5" fill="#ffee33" opacity="${opacity}" />
        </svg>
      `),
      scaledSize: new google.maps.Size(28, 28),
      anchor: new google.maps.Point(14, 14)
    };
  } else {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: "#00f3ff",
      fillOpacity: opacity,
      strokeWeight: 2,
      strokeColor: "#ffffff",
      strokeOpacity: opacity
    };
  }
}

function formatStarRating(rating) {
  if (rating === undefined || rating === null || isNaN(rating)) return "";
  const r = Math.max(0, Math.min(5, rating));
  
  let html = '<span style="display:inline-flex; align-items:center; gap:1px; vertical-align:middle;">';
  for (let i = 1; i <= 5; i++) {
    let fill = '#445566';
    if (r >= i) {
      fill = '#ffaa00';
    } else if (r > i - 1 && r < i) {
      fill = 'url(#half-star)';
    }
    
    html += `
      <svg width="13" height="13" viewBox="0 0 24 24" style="display:inline-block;">
        <defs>
          <linearGradient id="half-star">
            <stop offset="50%" stop-color="#ffaa00"/>
            <stop offset="50%" stop-color="#445566"/>
          </linearGradient>
        </defs>
        <path fill="${fill}" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
      </svg>
    `;
  }
  html += `</span> <span style="color: #99aabb; font-size: 0.75rem; vertical-align:middle; margin-left:4px;">(${r.toFixed(1)})</span>`;
  return html;
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
  document.querySelector('#detail-btn-maps-review-photo span').textContent = t.mapsReviewPhotoBtn;
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

  updateButtonStateUI();
  renderKeywordsList();
  if (appState.selectedKeywordForHistory) renderHistoryList();
  renderAllHistoryList();
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
    map.setOptions({ styles: currentMapStyleMode === 'botw' ? mapStyleBotw : mapStyleSheikahDark });
  }
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

async function requestCompassPermissionIfNeeded() {
  if (compassActive) return;
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission === 'granted') {
        window.addEventListener('deviceorientation', onDeviceOrientation, true);
        compassActive = true;
      }
    } catch (e) {
      console.warn("コンパス権限エラー:", e);
    }
  } else {
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
    compassActive = true;
  }
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

const RADIUS_OPTIONS = [100, 1000, 3000, 10000, 50000, 100000];
let savedRadiusIdx = parseInt(localStorage.getItem('sheikah_last_radius_idx') || '2', 10);
let radiusIndex = isNaN(savedRadiusIdx) ? 2 : savedRadiusIdx;

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
  currentPos: null,
  lastSearchedPos: null,

  currentHeading: 0,
  visualMapRotation: 0,
  lastCompassHeading: null,

  locationHistory: [],
  isWalking: false,
  lastWalkTimestamp: 0,
  movementCandidate: null,
  compassSamples: [],
  compassCandidate: null,

  activeKeyword: "",
  selectedKeywordForHistory: null,
  selectedSpotForDetail: null,
  fromAllHistory: false,
  fromChallenge: false,
  places: [],
  pinpointTarget: null
};

let wakeLockSentinel = null;
let watchId = null;
let compassActive = false;
let placesService = null;
let isSearchInProgress = false;
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

function initMap(lat, lng) {
  if (typeof google === 'undefined' || !google.maps) return;
  const centerPos = { lat, lng };

  if (!map) {
    map = new google.maps.Map(document.getElementById('map'), {
      center: centerPos,
      zoom: 17,
      disableDefaultUI: true,
      styles: currentMapStyleMode === 'botw' ? mapStyleBotw : mapStyleSheikahDark,
      gestureHandling: 'none'
    });
    placesService = new google.maps.places.PlacesService(map);
    redrawMarkersWithFade();
  } else {
    map.setCenter(centerPos);
  }
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

function evaluateSensorCycle() {
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

  let activeTargets = [];
  if (appState.pinpointTarget) {
    activeTargets = [appState.pinpointTarget];
  } else {
    const db = loadSavedData();
    activeTargets = appState.places.filter(p => {
      const item = db.arrivals.find(a => a.id === p.id);
      return !item || !item.muted;
    });
  }

  countEl.textContent = activeTargets.length;

  if (activeTargets.length === 0) {
    if (!distInfoEl.textContent.includes("API")) {
      distInfoEl.textContent = t.noSpotsInRange;
    }
    if (radarTimer) { clearTimeout(radarTimer); radarTimer = null; }
    scheduledInterval = null;
    updateVisualRing('idle');
    return;
  }

  let closestTarget = null;
  let minDistance = Infinity;
  let targetBearingDiff = 0;

  activeTargets.forEach(tItem => {
    const d = getDistance(appState.currentPos.lat, appState.currentPos.lng, tItem.lat, tItem.lng);
    if (d < minDistance) {
      minDistance = d;
      closestTarget = tItem;
      const bearing = getBearing(appState.currentPos.lat, appState.currentPos.lng, tItem.lat, tItem.lng);
      let diff = Math.abs(appState.currentHeading - bearing);
      if (diff > 180) diff = 360 - diff;
      targetBearingDiff = diff;
    }
  });

  if (minDistance <= 20) {
    handleArrival(closestTarget);
    return;
  }

  let interval = null;
  let level = 'idle';

  if (targetBearingDiff >= 90) {
    level = 'idle';
    interval = null;
  } else if (minDistance <= 50 && targetBearingDiff <= 20) {
    level = 'level4';
    interval = 450;
  } else if ((minDistance <= 120 && targetBearingDiff <= 35) || (minDistance <= 50 && targetBearingDiff <= 55)) {
    level = 'level3';
    interval = 800;
  } else if (minDistance <= 300 && targetBearingDiff <= 55) {
    level = 'level2';
    interval = 1500;
  } else if (targetBearingDiff < 85) {
    level = 'level1';
    interval = 2600;
  }

  updateVisualRing(level);

  if (!distInfoEl.textContent.includes("API")) {
    distInfoEl.textContent = (level === 'idle') ? t.noSpotsInRange : t.spotDetected;
  }

  if (interval !== null) {
    scheduleRadarSound(interval, level === 'level4');
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
  const flash = document.getElementById('arrival-flash-overlay');
  if (flash) {
    flash.classList.remove('flash-anim');
    void flash.offsetWidth;
    flash.classList.add('flash-anim');
  }

  playTreasureFanfare();

  const db = loadSavedData();
  const now = new Date().toISOString();

  const existing = db.arrivals.find(a => a.id === target.id);
  const cacheValid = existing && existing.rating !== undefined && existing.rating !== null && existing.ratingCachedAt && (Date.now() - existing.ratingCachedAt < TWENTY_FOUR_HOURS);

  if (cacheValid) {
    updateArrivalRecord(db, target, now, existing.rating, existing.ratingCachedAt);
  } else if (placesService && target.id) {
    placesService.getDetails({ placeId: target.id, fields: ['rating', 'photos', 'formatted_address'] }, (place, status) => {
      const ratingVal = (status === google.maps.places.PlacesServiceStatus.OK && place && place.rating !== undefined) ? place.rating : null;
      const addrVal = (status === google.maps.places.PlacesServiceStatus.OK && place && place.formatted_address) ? place.formatted_address : null;
      const photosVal = (status === google.maps.places.PlacesServiceStatus.OK && place && place.photos) ? place.photos.map(p => p.getUrl({ maxWidth: 800, maxHeight: 600 })) : [];
      updateArrivalRecordWithDetails(db, target, now, ratingVal, addrVal, photosVal, Date.now());
    });
  } else {
    updateArrivalRecordWithDetails(db, target, now, null, null, [], Date.now());
  }
}

function updateArrivalRecordWithDetails(db, target, now, ratingVal, addrVal, photosVal, cachedTime) {
  const existing = db.arrivals.find(a => a.id === target.id);
  if (!existing) {
    db.arrivals.push({
      id: target.id,
      name: target.name,
      keyword: appState.activeKeyword,
      lat: target.lat,
      lng: target.lng,
      date: now,
      muted: true,
      rating: ratingVal,
      formatted_address: addrVal,
      cachedPhotos: photosVal,
      ratingCachedAt: cachedTime
    });
  } else {
    if (ratingVal !== null) existing.rating = ratingVal;
    if (addrVal) existing.formatted_address = addrVal;
    if (photosVal && photosVal.length > 0) existing.cachedPhotos = photosVal;
    existing.ratingCachedAt = cachedTime;
  }

  if (!db.keywordHistory[appState.activeKeyword]) {
    db.keywordHistory[appState.activeKeyword] = { lastSearch: now, lastArrival: now };
  } else {
    db.keywordHistory[appState.activeKeyword].lastArrival = now;
  }
  saveAppData(db);

  redrawMarkersWithFade();

  const t = I18N[currentLang];
  const toast = document.getElementById('toast-banner');
  document.getElementById('toast-text').textContent = t.toastRecorded(target.name);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 5000);

  if (!appState.continuousSearch) {
    appState.pinpointTarget = null;
    stopSearchAndReset();
    return;
  }

  if (appState.pinpointTarget) {
    appState.pinpointTarget = null;
    executeSearch();
  }

  setTimeout(() => {
    evaluateSensorCycle();
  }, 1500);
}

function updateArrivalRecord(db, target, now, ratingVal, cachedTime) {
  updateArrivalRecordWithDetails(db, target, now, ratingVal, null, [], cachedTime);
}

function rotateMapSmoothly(targetBearing) {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) return;

  const desiredAngle = -targetBearing;
  let diff = (desiredAngle - appState.visualMapRotation) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  appState.visualMapRotation += diff;
  mapDiv.style.transform = `rotate(${appState.visualMapRotation}deg)`;
}

// Compare angles across north without treating 359° → 1° as a full turn.
function headingDelta(target, current) {
  return ((target - current + 540) % 360) - 180;
}

function updateStoppedState(now) {
  if (appState.movementCandidate && now - appState.movementCandidate.lastTime > 4000) {
    appState.movementCandidate = null;
  }
  if (appState.isWalking && now - appState.lastWalkTimestamp >= 5000) {
    appState.isWalking = false;
    appState.movementCandidate = null;
    appState.locationHistory = [];
    appState.compassSamples = [];
    appState.compassCandidate = null;
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
    appState.compassSamples = [];
    appState.compassCandidate = null;
  }
  appState.lastWalkTimestamp = now;
  return heading;
}

function onDeviceOrientation(e) {
  let compassHeading = null;
  if (Number.isFinite(e.webkitCompassHeading)) {
    if (Number.isFinite(e.webkitCompassAccuracy) &&
        (e.webkitCompassAccuracy < 0 || e.webkitCompassAccuracy > 25)) {
      appState.compassSamples = [];
      appState.compassCandidate = null;
      return;
    }
    compassHeading = e.webkitCompassHeading;
  } else if (Number.isFinite(e.alpha)) {
    compassHeading = (360 - e.alpha) % 360;
  }
  if (compassHeading === null) return;

  const now = Date.now();
  updateStoppedState(now);
  if (appState.isWalking || appState.movementCandidate) {
    appState.compassSamples = [];
    appState.compassCandidate = null;
    return;
  }

  const samples = appState.compassSamples.filter(s => now - s.time <= 600);
  samples.push({ heading: compassHeading, time: now });
  appState.compassSamples = samples;
  if (samples.length < 3 || now - samples[0].time < 400) return;

  let sin = 0, cos = 0;
  for (const sample of samples) {
    const rad = sample.heading * Math.PI / 180;
    sin += Math.sin(rad);
    cos += Math.cos(rad);
  }
  if (Math.hypot(sin, cos) / samples.length < 0.98) {
    appState.compassCandidate = null;
    return;
  }
  const smoothed = (Math.atan2(sin, cos) * 180 / Math.PI + 360) % 360;
  if (Math.abs(headingDelta(smoothed, appState.currentHeading)) < 8) {
    appState.compassCandidate = null;
    return;
  }
  const candidate = appState.compassCandidate;
  if (!candidate || now - candidate.lastTime > 1000 ||
      Math.abs(headingDelta(smoothed, candidate.heading)) > 8) {
    appState.compassCandidate = { heading: smoothed, since: now, lastTime: now };
    return;
  }
  candidate.lastTime = now;
  if (now - candidate.since < 500) return;

  appState.lastCompassHeading = smoothed;
  appState.currentHeading = smoothed;
  appState.compassCandidate = null;
  rotateMapSmoothly(smoothed);
  evaluateSensorCycle();
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

  if (map) {
    map.setCenter(newPos);
  }

  if (!appState.pinpointTarget) {
    const currentRadius = RADIUS_OPTIONS[radiusIndex];
    const refreshThreshold = Math.max(30, Math.min(300, currentRadius * 0.05));

    if (appState.lastSearchedPos) {
      const movedSinceSearch = getDistance(
        appState.lastSearchedPos.lat, appState.lastSearchedPos.lng,
        newPos.lat, newPos.lng
      );
      if (movedSinceSearch >= refreshThreshold) {
        executeSearch();
      }
    } else {
      executeSearch();
    }
  }

  evaluateSensorCycle();
}

function executeSearch() {
  if (!appState.currentPos || isSearchInProgress || appState.pinpointTarget || !appState.activeKeyword) return;
  isSearchInProgress = true;
  appState.lastSearchedPos = { ...appState.currentPos };
  const currentRadius = RADIUS_OPTIONS[radiusIndex];

  const rText = currentRadius >= 1000 ? `${currentRadius/1000}km` : `${currentRadius}m`;
  const t = I18N[currentLang];
  document.getElementById('target-meta-info').textContent = t.targetMeta(appState.activeKeyword, rText);

  if (placesService) {
    const queryWord = appState.activeKeyword.trim();
    
    const request = {
      location: new google.maps.LatLng(appState.currentPos.lat, appState.currentPos.lng),
      radius: currentRadius,
      query: queryWord
    };

    placesService.textSearch(request, (results, status) => {
      isSearchInProgress = false;
      if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
        const filtered = results.filter(place => {
          const d = getDistance(
            appState.currentPos.lat, appState.currentPos.lng,
            place.geometry.location.lat(), place.geometry.location.lng()
          );
          return d <= currentRadius;
        });

        appState.places = filtered.map(place => ({
          id: place.place_id,
          name: place.name,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        }));
      } else {
        appState.places = [];
        if (status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS && status !== google.maps.places.PlacesServiceStatus.OK) {
          console.warn("Places API Status:", status);
          document.getElementById('distance-info').innerHTML = `<span style="color:#ff5555;">API Error: ${status}</span>`;
        }
      }
      evaluateSensorCycle();
    });
  } else {
    isSearchInProgress = false;
  }
}

function getRadiusText(r) {
  return r >= 1000 ? `${r/1000}km` : `${r}m`;
}

document.getElementById('radius-val').textContent = getRadiusText(RADIUS_OPTIONS[radiusIndex]);
document.getElementById('radius-select').value = radiusIndex.toString();

document.getElementById('radius-select').addEventListener('change', (e) => {
  radiusIndex = parseInt(e.target.value, 10);
  document.getElementById('radius-val').textContent = getRadiusText(RADIUS_OPTIONS[radiusIndex]);
  localStorage.setItem('sheikah_last_radius_idx', radiusIndex.toString());
  if (appState.isTracking) {
    executeSearch();
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
  keywordInputEl.focus();
});

keywordInputEl.addEventListener('focus', () => {
  if (appState.isTracking && keywordInputEl.value.trim() !== "") {
    const t = I18N[currentLang];
    if (confirm(t.confirmEndSearch)) {
      stopSearchAndReset();
      keywordInputEl.value = '';
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
  appState.continuousSearch = !appState.continuousSearch;
  updateButtonStateUI();
  showContinuousModeToast();
});

function stopSearchAndReset() {
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

async function startSearchFromSet() {
  initAudio();
  playBeep(2200);
  if (appState.wakeLockActive) requestWakeLock();

  const inputVal = document.getElementById('keyword-input').value.trim();
  if (!inputVal) {
    alert("キーワードを入力してください");
    return;
  }

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
  pageChallengeKeywords.classList.remove('open');
  pageChallenges.classList.remove('open');
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
    pageChallenges.classList.remove('open');
    pageChallengeKeywords.classList.remove('open');
    pageAllHistory.classList.remove('open');
    pageSpotDetail.classList.remove('open');
    pageHistory.classList.remove('open');
    renderKeywordsList();
    pageKeywords.classList.add('open');
    updateFooterActive(2);
  });

  fnavBtnAll?.addEventListener('click', () => {
    pageChallenges.classList.remove('open');
    pageChallengeKeywords.classList.remove('open');
    pageSpotDetail.classList.remove('open');
    pageHistory.classList.remove('open');
    renderAllHistoryList();
    pageAllHistory.classList.add('open');
    updateFooterActive(3);
  });

  // 仮コンテンツタップ挙動
  document.getElementById('dummy-challenge-item')?.addEventListener('click', () => {
    pageChallengeKeywords.classList.add('open');
  });
  document.getElementById('dummy-challenge-keyword-item')?.addEventListener('click', () => {
    appState.fromChallenge = true;
    appState.fromAllHistory = false;
    document.getElementById('detail-spot-name').textContent = "チャレンジターゲットA（仮）";
    document.getElementById('detail-spot-address').textContent = "仮のコンテンツです";
    pageSpotDetail.classList.add('open');
  });
  document.getElementById('back-to-challenges')?.addEventListener('click', () => {
    pageChallengeKeywords.classList.remove('open');
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

  // 1-1. チャレンジ図鑑一覧：左スワイプ時メインへ／右スワイプ時チャレンジ一覧へ戻る
  bindSwipe(pageChallengeKeywords, () => {
    pageChallengeKeywords.classList.remove('open');
    pageChallenges.classList.remove('open');
    updateFooterActive(1);
  }, () => {
    pageChallengeKeywords.classList.remove('open');
    updateFooterActive(0);
  });

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

      if ((item.rating === undefined || item.rating === null) || !item.ratingCachedAt || (Date.now() - item.ratingCachedAt < TWENTY_FOUR_HOURS)) {
        if (placesService && item.id) {
          placesService.getDetails({ placeId: item.id, fields: ['rating'] }, (place, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && place && place.rating !== undefined) {
              item.rating = place.rating;
              item.ratingCachedAt = Date.now();
              saveAppData(db);
              const starEl = document.getElementById(`list-star-${item.id}`);
              if (starEl) starEl.innerHTML = formatStarRating(item.rating);
            }
          });
        }
      }

      const starHtml = formatStarRating(item.rating);

      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="list-item-left">
          <span class="list-item-title">${item.name}</span>
          <div id="list-star-${item.id}" style="margin: 3px 0 4px 0;">${starHtml}</div>
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

      if ((item.rating === undefined || item.rating === null) || !item.ratingCachedAt || (Date.now() - item.ratingCachedAt < TWENTY_FOUR_HOURS)) {
        if (placesService && item.id) {
          placesService.getDetails({ placeId: item.id, fields: ['rating'] }, (place, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && place && place.rating !== undefined) {
              item.rating = place.rating;
              item.ratingCachedAt = Date.now();
              saveAppData(db);
              const starEl = document.getElementById(`all-star-${item.id}`);
              if (starEl) starEl.innerHTML = formatStarRating(item.rating);
            }
          });
        }
      }

      const starHtml = formatStarRating(item.rating);
      const keywordLabel = t.targetKeywordLabel(item.keyword || '-');

      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="list-item-left">
          <span class="list-item-title">${item.name}</span>
          <div id="all-star-${item.id}" style="margin: 3px 0 2px 0;">${starHtml}</div>
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
    backBtn.textContent = currentLang === 'ja' ? '◀チャレンジ' : '◀Challenge';
  } else {
    backBtn.textContent = currentLang === 'ja' ? '◀履歴図鑑' : '◀Places';
  }

  document.getElementById('detail-spot-name').textContent = item.name;
  document.getElementById('detail-spot-rating').innerHTML = formatStarRating(item.rating);
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

  const photosBox = document.getElementById('detail-photos-container');
  photosBox.innerHTML = `<div class="no-photos-box">${t.loadingPhotos}</div>`;

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
      } else {
        renderHistoryList();
      }
    }
  };

  document.getElementById('detail-btn-maps-review-photo').onclick = () => {
    const reviewUrl = item.id 
      ? `https://search.google.com/local/writereview?placeid=${item.id}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name)}`;
    window.open(reviewUrl, '_blank');
  };

  pageSpotDetail.classList.add('open');

  const gallery = document.createElement('div');
  gallery.className = 'photo-gallery-scroll';

  const mapWrap = document.createElement('div');
  mapWrap.className = 'gallery-minimap-wrap';
  mapWrap.innerHTML = `
    <div id="detail-minimap"></div>
    <div class="minimap-badge">${t.minimapBadge}</div>
  `;
  gallery.appendChild(mapWrap);

  if (!placesService) {
    initMap(item.lat, item.lng);
  }

  const detailCacheValid = item.rating !== undefined && item.rating !== null && item.ratingCachedAt && (Date.now() - item.ratingCachedAt < TWENTY_FOUR_HOURS) && item.cachedPhotos && item.cachedPhotos.length > 0;

  if (detailCacheValid) {
    document.getElementById('detail-spot-address').textContent = item.formatted_address || t.noAddress;
    loadPhotosAndMap(item, gallery, photosBox);
  } else if (placesService && item.id) {
    placesService.getDetails({
      placeId: item.id,
      fields: ['name', 'formatted_address', 'photos', 'rating']
    }, (place, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && place) {
        document.getElementById('detail-spot-address').textContent = place.formatted_address || t.noAddress;
        item.formatted_address = place.formatted_address;
        if (place.rating !== undefined) {
          item.rating = place.rating;
          item.ratingCachedAt = Date.now();
          document.getElementById('detail-spot-rating').innerHTML = formatStarRating(item.rating);
        }
        if (place.photos && place.photos.length > 0) {
          item.cachedPhotos = place.photos.map(p => p.getUrl({ maxWidth: 800, maxHeight: 600 }));
        }
        saveAppData(db);
      } else {
        document.getElementById('detail-spot-address').textContent = t.noAddress;
      }
      loadPhotosAndMap(item, gallery, photosBox);
    });
  } else {
    photosBox.innerHTML = '';
    photosBox.appendChild(gallery);
  }
}

function loadPhotosAndMap(item, gallery, photosBox) {
  if (item.cachedPhotos && item.cachedPhotos.length > 0) {
    item.cachedPhotos.forEach(url => {
      const wrap = document.createElement('div');
      wrap.className = 'gallery-img-wrap';
      wrap.innerHTML = `<img src="${url}" alt="${item.name}" loading="lazy">`;
      gallery.appendChild(wrap);
    });
  } else {
    const noPhoto = document.createElement('div');
    noPhoto.className = 'no-photos-box';
    noPhoto.style.flex = '0 0 85%';
    noPhoto.textContent = I18N[currentLang].noPhotosText;
    gallery.appendChild(noPhoto);
  }
  photosBox.innerHTML = '';
  photosBox.appendChild(gallery);

  setTimeout(() => {
    const isDay = (currentMapStyleMode === 'botw');
    detailMinimapInstance = new google.maps.Map(document.getElementById('detail-minimap'), {
      center: { lat: item.lat, lng: item.lng },
      zoom: 17,
      disableDefaultUI: true,
      styles: isDay ? mapStyleBotw : mapStyleSheikahDark,
      gestureHandling: 'none',
      draggable: false,
      scrollwheel: false,
      disableDoubleClickZoom: true
    });

    new google.maps.Marker({
      position: { lat: item.lat, lng: item.lng },
      map: detailMinimapInstance,
      title: item.name,
      icon: getMarkerIcon(isDay)
    });
  }, 80);
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

document.getElementById('btn-safety-ok').addEventListener('click', async () => {
  document.getElementById('safety-prompt-overlay').classList.remove('show');
  initAudio();

  if (appState.wakeLockActive) {
    await requestWakeLock();
  }

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        appState.currentPos = p;
        lastKnownPos = p;
        localStorage.setItem('sheikah_last_pos', JSON.stringify(p));
        if (map) map.setCenter(p);
      },
      (err) => { console.warn("位置情報許可拒否またはエラー:", err.message); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission === 'granted') {
        window.addEventListener('deviceorientation', onDeviceOrientation, true);
        compassActive = true;
      }
    } catch (e) {
      console.warn("コンパス権限エラー:", e);
    }
  } else {
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
    compassActive = true;
  }
});

applyLanguage(currentLang);
window.addEventListener('load', () => {
  bootstrapMapAndLocation();
  checkAndShowStartupModals();
});
