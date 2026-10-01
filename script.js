/**
 * ============================================================
 * [JavaScript Version Management Specification]
 * - 採番形式: v0.[Year].[Month]1.[DateHourMinute]
 * ============================================================
 */
const BASE_JS_VERSION = "v0.26.101.012440";

(function() {
  const metaTag = document.querySelector('meta[name="html-rev"]');
  const htmlRev = metaTag ? metaTag.getAttribute('content') : "09";

  const computedStyle = getComputedStyle(document.documentElement);
  let cssRev = computedStyle.getPropertyValue('--css-rev').trim().replace(/['"]/g, '');
  if (!cssRev) cssRev = "08";

  const fullVersion = `${BASE_JS_VERSION}.${htmlRev}.${cssRev}`;
  document.querySelectorAll('.app-build-ver-span').forEach(el => {
    el.textContent = fullVersion;
  });
})();

document.addEventListener("DOMContentLoaded", () => {
  const metaTag = document.querySelector('meta[name="html-rev"]');
  const htmlRev = metaTag ? metaTag.getAttribute('content') : "09";

  const computedStyle = getComputedStyle(document.documentElement);
  let cssRev = computedStyle.getPropertyValue('--css-rev').trim().replace(/['"]/g, '');
  if (!cssRev) cssRev = "08";

  const fullVersion = `${BASE_JS_VERSION}.${htmlRev}.${cssRev}`;
  document.querySelectorAll('.app-build-ver-span').forEach(el => {
    el.textContent = fullVersion;
  });

  setupDataTransferEasterEgg();
  initFooterNavigation();
  initCircularSwipeNavigation();
});

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
    soundOn: "SOUND: ON",
    soundOff: "SOUND: MUTED",
    wakeLockOn: "WAKE LOCK: ON",
    wakeLockOff: "WAKE LOCK: OFF",
    langSwitchLabel: "→EN",
    footerTip: "※消音時も円周の光とフラッシュで反応",
    backToMain: "◀メイン",
    keywordsTitle: "図鑑キーワード",
    challengesTitle: "チャレンジ一覧",
    filterKeywordsPlaceholder: "キーワード絞り込み...",
    filterChallengesPlaceholder: "チャレンジ絞り込み...",
    filterHistoryPlaceholder: "到達スポット絞り込み...",
    sortSearch: "検索日時順",
    sortArrival: "到達日時順",
    sortCount: "到達件数降順",
    cleanZeroBtn: "到達0件の履歴を一括削除",
    deleteCurrentKeyBtn: "このキーワードの履歴を一括削除",
    backToKeywords: "履歴一覧",
    backToHistory: "戻る",
    spotDetailTitle: "スポット詳細",
    allHistoryTitle: "全スポット一覧",
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
    soundOn: "SOUND: ON",
    soundOff: "SOUND: MUTED",
    wakeLockOn: "WAKE LOCK: ON",
    wakeLockOff: "WAKE LOCK: OFF",
    langSwitchLabel: "→JP",
    footerTip: "Visual ring pulses even in mute mode",
    backToMain: "◀Main",
    keywordsTitle: "Atlas Keywords",
    challengesTitle: "Challenges",
    filterKeywordsPlaceholder: "Filter keywords...",
    filterChallengesPlaceholder: "Filter challenges...",
    filterHistoryPlaceholder: "Filter places...",
    sortSearch: "By Search Date",
    sortArrival: "By Discovery Date",
    sortCount: "By Discovery Count",
    cleanZeroBtn: "Delete Zero-Hit Records",
    deleteCurrentKeyBtn: "Delete This Keyword's History",
    backToKeywords: "Keywords",
    backToHistory: "Back",
    spotDetailTitle: "Place Details",
    allHistoryTitle: "All Discovered Spots",
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
    targetMeta: (k, r) => `[Target: ${k || 'None'} / Range:${r}]`,
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
  document.getElementById('title-page-challenges').textContent = t.challengesTitle;
  document.getElementById('challenge-filter').placeholder = t.filterChallengesPlaceholder;
  document.getElementById('title-page-keywords').textContent = t.keywordsTitle;
  document.getElementById('keyword-filter').placeholder = t.filterKeywordsPlaceholder;
  document.getElementById('history-filter').placeholder = t.filterHistoryPlaceholder;
  document.getElementById('opt-sort-search').textContent = t.sortSearch;
  document.getElementById('opt-sort-arrival').textContent = t.sortArrival;
  document.getElementById('opt-sort-count').textContent = t.sortCount;
  document.getElementById('btn-delete-zero-keywords').textContent = t.cleanZeroBtn;
  document.getElementById('btn-delete-current-keyword').textContent = t.deleteCurrentKeyBtn;
  document.getElementById('back-to-history-list').innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24" style="width:16px;height:16px;vertical-align:middle;margin-right:2px;"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>` + t.backToHistory;
  document.getElementById('back-to-keywords').innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24" style="width:16px;height:16px;vertical-align:middle;margin-right:2px;"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>` + t.backToKeywords;
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
  renderChallengesList();
  renderKeywordsList();
  if (appState.selectedKeywordForHistory) renderHistoryList();
  renderAllHistoryList();
}

document.getElementById('pwa-lang-btn').addEventListener('click', () => {
  applyLanguage(currentLang === 'ja' ? 'en' : 'ja');
});

let safetyClickCount = 0;
let safetyResetTimer = null;

document.getElementById('safety-lang-btn').addEventListener('click', () => {
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

function triggerDataTransferPrompt() {
  const db = loadSavedData();
  const jsonStr = JSON.stringify(db);
  const base64Code = btoa(unescape(encodeURIComponent(jsonStr)));

  const choice = prompt(
    "【Sheikah Slate Data Transfer】\n" +
    "1: 引き継ぎコードを発行（コピーしてPWA側へ移す）\n" +
    "2: 引き継ぎコードを読み込む（データを復元する）\n" +
    "半角数字「1」または「2」を入力してください:",
    "1"
  );

  if (choice === "1") {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(base64Code).then(() => {
        alert("引き継ぎコードをクリップボードにコピーしました！\nホーム画面のPWAを開き、裏コマンドから「2」で貼り付けてください。");
      }).catch(() => {
        prompt("以下の引き継ぎコードを全選択してコピーしてください:", base64Code);
      });
    } else {
      prompt("以下の引き継ぎコードを全選択してコピーしてください:", base64Code);
    }
  } else if (choice === "2") {
    const inputCode = prompt("コピーした引き継ぎコードを貼り付けてください:");
    if (inputCode && inputCode.trim()) {
      try {
        const restoredJson = decodeURIComponent(escape(atob(inputCode.trim())));
        const restoredDb = JSON.parse(restoredJson);
        if (restoredDb && restoredDb.arrivals) {
          saveAppData(restoredDb);
          renderKeywordsList();
          alert("データの引き継ぎが完了しました！");
        } else {
          alert("無効な引き継ぎコードです。");
        }
      } catch (e) {
        alert("引き継ぎコードの解析に失敗しました。正しいコードを入力してください。");
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

    gain.gain.setValueAtTime(0.55, audioCtx.currentTime);
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
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      const dur = (idx === notes.length - 1) ? 1.5 : 0.18;
      gain.gain.setValueAtTime(0.55, audioCtx.currentTime);
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

let appState = {
  isTracking: false,
  isPaused: false,
  isMuted: false,
  wakeLockActive: true,
  currentPos: null,
  lastSearchedPos: null,

  currentHeading: 0,
  visualMapRotation: 0,
  lastCompassHeading: null,

  locationHistory: [],
  isWalking: false,
  lastWalkTimestamp: 0,

  activeKeyword: "",
  selectedKeywordForHistory: null,
  selectedSpotForDetail: null,
  fromAllHistory: false,
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
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        appState.currentPos = p;
        lastKnownPos = p;
        localStorage.setItem('sheikah_last_pos', JSON.stringify(p));
        if (map) map.setCenter(p);
      },
      (err) => {
        console.warn("初期位置測位:", err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
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

function calculateSmoothedHeading(newPos) {
  appState.locationHistory.push({ lat: newPos.lat, lng: newPos.lng, time: Date.now() });
  if (appState.locationHistory.length > 5) {
    appState.locationHistory.shift();
  }

  if (appState.locationHistory.length < 2) return null;

  const oldest = appState.locationHistory[0];
  const totalMoved = getDistance(oldest.lat, oldest.lng, newPos.lat, newPos.lng);
  if (totalMoved < 2.5) {
    return null;
  }

  let sinSum = 0;
  let cosSum = 0;
  for (let i = 1; i < appState.locationHistory.length; i++) {
    const p1 = appState.locationHistory[i - 1];
    const p2 = appState.locationHistory[i];
    const d = getDistance(p1.lat, p1.lng, p2.lat, p2.lng);
    if (d > 0.5) {
      const b = getBearing(p1.lat, p1.lng, p2.lat, p2.lng);
      const rad = b * Math.PI / 180;
      const weight = i;
      sinSum += Math.sin(rad) * weight;
      cosSum += Math.cos(rad) * weight;
    }
  }

  if (sinSum === 0 && cosSum === 0) return null;
  return (Math.atan2(sinSum, cosSum) * 180 / Math.PI + 360) % 360;
}

function onDeviceOrientation(e) {
  let compassHeading = null;
  if (e.webkitCompassHeading !== undefined) {
    compassHeading = e.webkitCompassHeading;
  } else if (e.alpha !== null) {
    compassHeading = (360 - e.alpha) % 360;
  }

  if (compassHeading === null || isNaN(compassHeading)) return;

  const now = Date.now();
  const isCompletelyStopped = (!appState.isWalking && (now - appState.lastWalkTimestamp > 5000));

  if (isCompletelyStopped) {
    if (appState.lastCompassHeading !== null) {
      let cDiff = Math.abs(compassHeading - appState.lastCompassHeading);
      if (cDiff > 180) cDiff = 360 - cDiff;
      if (cDiff < 6.0) return;
    }

    appState.lastCompassHeading = compassHeading;
    appState.currentHeading = compassHeading;
    rotateMapSmoothly(compassHeading);
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
  const speed = pos.coords.speed;
  const gpsHeading = pos.coords.heading;

  let determinedHeading = null;

  if (gpsHeading !== null && !isNaN(gpsHeading) && speed !== null && speed >= 1.2) {
    determinedHeading = gpsHeading;
    appState.isWalking = true;
    appState.lastWalkTimestamp = now;
  } else {
    const smoothed = calculateSmoothedHeading(newPos);
    if (smoothed !== null) {
      determinedHeading = smoothed;
      appState.isWalking = true;
      appState.lastWalkTimestamp = now;
    }
  }

  if (determinedHeading !== null) {
    let diffFromCurrent = Math.abs(determinedHeading - appState.currentHeading);
    if (diffFromCurrent > 180) diffFromCurrent = 360 - diffFromCurrent;

    if (diffFromCurrent >= 7.0 || appState.currentHeading === 0) {
      appState.currentHeading = determinedHeading;
      rotateMapSmoothly(determinedHeading);
    }
  } else {
    if (now - appState.lastWalkTimestamp > 5000) {
      appState.isWalking = false;
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
  document.getElementById('challenge-filter'),
  document.getElementById('btn-challenge-filter-clear'),
  () => renderChallengesList()
);
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
  const svgSound = document.getElementById('svg-sound');
  const labelSound = document.getElementById('label-sound-state');
  if (appState.isMuted) {
    muteBtn.className = "btn-sheikah btn-sub-control";
    svgSound.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    labelSound.textContent = t.soundOff;
  } else {
    muteBtn.className = "btn-sheikah btn-sub-control active";
    svgSound.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.02v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    labelSound.textContent = t.soundOn;
  }

  const wakeBtn = document.getElementById('wakelock-toggle-btn');
  const svgWake = document.getElementById('svg-wake');
  const labelWake = document.getElementById('label-wake-state');
  if (appState.wakeLockActive) {
    wakeBtn.className = "btn-sheikah btn-sub-control active";
    svgWake.innerHTML = '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1 z"/>';
    labelWake.textContent = t.wakeLockOn;
  } else {
    wakeBtn.className = "btn-sheikah btn-sub-control";
    svgWake.innerHTML = '<path d="M12.3 2a10 10 0 0 0-1.9 19.8 10 10 0 0 0 11.4-11.4A10 10 0 0 0 12.3 2z"/>';
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

document.getElementById('wakelock-toggle-btn').addEventListener('click', async () => {
  appState.wakeLockActive = !appState.wakeLockActive;
  if (appState.wakeLockActive) {
    await requestWakeLock();
  } else {
    releaseWakeLock();
  }
  updateButtonStateUI();
});

document.getElementById('mute-toggle-btn').addEventListener('click', () => {
  appState.isMuted = !appState.isMuted;
  if (!appState.isMuted) {
    initAudio();
    playBeep(2000, 0.08);
  }
  updateButtonStateUI();
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
      maximumAge: 1000,
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

const pageElementsOrder = [
  document.getElementById('page-challenges'),
  document.getElementById('page-main-wrap'),
  document.getElementById('page-keywords'),
  document.getElementById('page-all-history')
];
let activePageIndex = 1;

function switchTab(targetIndex) {
  if (targetIndex < 0 || targetIndex >= pageElementsOrder.length) return;
  activePageIndex = targetIndex;

  // サブ画面（履歴や詳細）は閉じる
  document.getElementById('page-history').classList.remove('open');
  document.getElementById('page-spot-detail').classList.remove('open');

  pageElementsOrder.forEach((el, idx) => {
    if (idx === targetIndex) {
      el.classList.add('open');
    } else {
      el.classList.remove('open');
    }
  });

  const footerBtns = document.querySelectorAll('.app-footer-nav .footer-nav-btn');
  footerBtns.forEach((btn, idx) => {
    if (idx === targetIndex) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (targetIndex === 1) {
    evaluateSensorCycle();
  } else if (targetIndex === 0) {
    renderChallengesList();
  } else if (targetIndex === 2) {
    renderKeywordsList();
  } else if (targetIndex === 3) {
    renderAllHistoryList();
  }
}

function initFooterNavigation() {
  const footerBtns = document.querySelectorAll('.app-footer-nav .footer-nav-btn');
  footerBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      initAudio();
      switchTab(idx);
    });
  });
  switchTab(1);
}

function initCircularSwipeNavigation() {
  const container = document.getElementById('app-container');
  let startX = 0;
  let startY = 0;

  container.addEventListener('touchstart', (e) => {
    if (document.getElementById('page-spot-detail').classList.contains('open') || document.getElementById('page-history').classList.contains('open')) {
      return;
    }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (document.getElementById('page-spot-detail').classList.contains('open') || document.getElementById('page-history').classList.contains('open')) {
      return;
    }
    const diffX = e.changedTouches[0].clientX - startX;
    const diffY = e.changedTouches[0].clientY - startY;

    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX > 0) {
        // 右へスワイプ（前の画面へ）
        if (activePageIndex > 0) {
          switchTab(activePageIndex - 1);
        }
      } else {
        // 左へスワイプ（次の画面へ）
        if (activePageIndex < pageElementsOrder.length - 1) {
          switchTab(activePageIndex + 1);
        }
      }
    }
  }, { passive: true });
}

document.getElementById('back-to-keywords').addEventListener('click', () => {
  document.getElementById('page-history').classList.remove('open');
  renderKeywordsList();
});

document.getElementById('back-to-history-list').addEventListener('click', () => {
  document.getElementById('page-spot-detail').classList.remove('open');
});

function renderChallengesList() {
  const container = document.getElementById('challenges-list-container');
  container.innerHTML = '';
  const filterText = document.getElementById('challenge-filter').value.toLowerCase();

  const dummyChallenges = [
    { id: 'c1', name: 'チャレンジA', desc: '最初のチャレンジ項目です。' },
    { id: 'c2', name: 'チャレンジB', desc: '中級者向けのチャレンジ項目です。' },
    { id: 'c3', name: 'チャレンジC', desc: '上級者向けのチャレンジ項目です。' }
  ];

  const filtered = dummyChallenges.filter(c => c.name.toLowerCase().includes(filterText) || c.desc.toLowerCase().includes(filterText));

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #889; padding: 40px 10px; font-size: 0.95rem;">チャレンジはありません。</div>`;
    return;
  }

  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div class="list-item-row">
        <div class="list-item-left">
          <span class="list-item-title">${item.name}</span>
          <div class="list-item-sub">${item.desc}</div>
        </div>
        <div class="item-right-actions">
          <button class="btn-sheikah-sm btn-reset-search" data-key="${item.name}">SET</button>
          <div style="color: var(--sheikah-gold); font-size: 1.3rem;">▶</div>
        </div>
      </div>
    `;

    div.querySelector('.btn-reset-search').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('keyword-input').value = item.name;
      document.getElementById('btn-input-clear').classList.add('show');
      switchTab(1);
      startSearchFromSet();
    });

    container.appendChild(div);
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
      document.getElementById('page-history').classList.add('open');
    });

    div.querySelector('.btn-reset-search').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('keyword-input').value = k;
      document.getElementById('btn-input-clear').classList.add('show');
      switchTab(1);
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

  switchTab(1);

  appState.isTracking = true;
  appState.isPaused = false;
  updateButtonStateUI();
  evaluateSensorCycle();
}

function openSpotDetailModal(item) {
  appState.selectedSpotForDetail = item;
  const t = I18N[currentLang];
  const db = loadSavedData();

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
      document.getElementById('page-spot-detail').classList.remove('open');
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

  document.getElementById('page-spot-detail').classList.add('open');

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

document.getElementById('challenge-filter').addEventListener('input', renderChallengesList);
document.getElementById('keyword-filter').addEventListener('input', renderKeywordsList);
document.getElementById('sort-keywords').addEventListener('change', renderKeywordsList);
document.getElementById('history-filter').addEventListener('input', renderHistoryList);
document.getElementById('sort-history').addEventListener('change', renderHistoryList);

function checkAndShowStartupModals() {
  const pwaOverlay = document.getElementById('pwa-prompt-overlay');
  const safetyOverlay = document.getElementById('safety-prompt-overlay');

  if (!isStandaloneMode) {
    pwaOverlay.classList.add('show');
  } else {
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
