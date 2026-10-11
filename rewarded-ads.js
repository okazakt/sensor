/* AppLixir v6 rewarded access. Points are stored as integer tenths. */
(function (global) {
  'use strict';
  const STORAGE_KEY = 'sheikah_rewarded_access_v1';
  const SDK_URL = 'https://cdn.applixir.com/applixir.app.v6.1.0.js';

  function createAccessController({ storage, watchAd }) {
    let state = { initialWatched: false, units: 0 };
    let busy = false;
    function read() {
      try {
        const saved = JSON.parse(storage.getItem(STORAGE_KEY));
        if (saved && saved.initialWatched === true && Number.isInteger(saved.units) &&
            saved.units >= -4 && saved.units <= 10) state = saved;
      } catch { /* Use in-memory state if browser storage is unavailable. */ }
      return state;
    }
    function save() {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Session-only fallback. */ }
    }
    async function ensureAccess() {
      read();
      if (state.initialWatched && state.units > 0) return true;
      if (!await watchAd(!state.initialWatched ? 'initial' : 'continue')) return false;
      read();
      state = { initialWatched: true, units: state.units + 10 };
      save();
      return true;
    }
    return {
      snapshot() { return { ...read(), points: state.units / 10 }; },
      async startup() {
        if (busy) return false;
        if (read().initialWatched) return true;
        busy = true;
        try { return await ensureAccess(); } finally { busy = false; }
      },
      async search(kind, execute) {
        if (busy) return false;
        busy = true;
        try {
          if (!await ensureAccess()) return false;
          if (await execute() === false) return false;
          read();
          state.units -= kind === 'secret' ? 5 : 2;
          save();
          return true;
        } finally { busy = false; }
      }
    };
  }

  function createBrowserAdapter() {
    const dialog = document.getElementById('rewarded-access-dialog');
    const title = document.getElementById('rewarded-access-title');
    const description = document.getElementById('rewarded-access-description');
    const status = document.getElementById('rewarded-access-status');
    const agree = document.getElementById('rewarded-access-watch');
    const cancel = document.getElementById('rewarded-access-cancel');
    const container = document.getElementById('applixir-ad-container');
    let pending = null;
    let sdkPromise = null;
    let playing = false;
    let attempt = 0;
    let timer = null;
    const ja = () => global.SensorRewardAds?.language?.() !== 'en';
    const key = () => global.APPLIXIR_CONFIG?.apiKey?.trim();

    function loadSDK() {
      if (typeof global.initializeAndOpenPlayer === 'function') return Promise.resolve();
      if (sdkPromise) return sdkPromise;
      sdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SDK_URL;
        script.async = true;
        script.id = 'applixir-sdk';
        const timeout = setTimeout(() => fail(), 15000);
        function fail() {
          clearTimeout(timeout);
          script.remove();
          sdkPromise = null;
          reject(new Error('SDK unavailable'));
        }
        script.onload = () => {
          clearTimeout(timeout);
          if (typeof global.initializeAndOpenPlayer !== 'function') { fail(); return; }
          resolve();
        };
        script.onerror = fail;
        document.head.appendChild(script);
      });
      return sdkPromise;
    }

    function showConsent(error = '') {
      if (!pending) return;
      playing = false;
      title.textContent = ja()
        ? (pending.reason === 'initial' ? '動画を見て利用を開始' : '動画を見て探索を続ける')
        : (pending.reason === 'initial' ? 'Watch a video to start' : 'Watch a video to continue');
      description.textContent = ja()
        ? '広告動画の視聴に同意して利用を続けます。視聴完了で探索ポイントが1.0増えます。通常の探索は0.2、シークレットは0.5を消費します。広告収益は地図検索と運営費に充てられます。'
        : 'Agree to watch an ad to continue. Completing it adds 1.0 exploration point. Regular searches use 0.2 and Secret challenges use 0.5. Ad revenue supports location searches and operating costs.';
      cancel.textContent = ja() ? 'キャンセル' : 'Cancel';
      agree.textContent = ja() ? '同意して動画を見る' : 'Agree and watch';
      status.textContent = error;
      agree.disabled = true;
      if (!dialog.open) dialog.showModal();
      if (!key()) {
        status.textContent = ja() ? '広告の設定が未完了です。' : 'Advertising is not configured.';
        return;
      }
      const active = pending;
      loadSDK().then(() => {
        if (pending !== active || playing) return;
        agree.disabled = false;
      }).catch(() => {
        if (pending !== active) return;
        status.textContent = ja() ? '広告を読み込めませんでした。もう一度お試しください。' : 'Could not load advertising. Please try again.';
        agree.textContent = ja() ? '読み込みを再試行' : 'Retry loading';
        agree.disabled = false;
      });
    }

    function finish(success) {
      if (!pending) return;
      attempt++;
      clearTimeout(timer);
      playing = false;
      container.hidden = true;
      container.replaceChildren();
      const resolve = pending.resolve;
      pending = null;
      if (dialog.open) dialog.close();
      resolve(success);
    }

    agree.addEventListener('click', () => {
      if (!pending || playing) return;
      if (typeof global.initializeAndOpenPlayer !== 'function') { showConsent(); return; }
      playing = true;
      const currentAttempt = ++attempt;
      dialog.close();
      container.hidden = false;
      function failure() {
        if (!pending || currentAttempt !== attempt) return;
        attempt++;
        clearTimeout(timer);
        container.hidden = true;
        container.replaceChildren();
        showConsent(ja()
          ? '動画の視聴が完了していません。広告がない場合は、時間をおいて再試行してください。'
          : 'The video was not completed. If no ad is available, please try again later.');
      }
      // A hung player must not grant points or leave the app permanently blocked.
      timer = setTimeout(failure, 180000);
      try {
        global.initializeAndOpenPlayer({
          apiKey: key(), injectionElementId: 'applixir-ad-container',
          adStatusCallbackFn(event) {
            if (!pending || currentAttempt !== attempt) return;
            if (event?.type === 'complete') finish(true);
            else if (['skipped', 'manuallyEnded', 'consentDeclined', 'allAdsCompleted'].includes(event?.type)) failure();
          },
          adErrorCallbackFn: failure
        });
      } catch { failure(); }
    });
    cancel.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    return reason => {
      if (pending) return Promise.resolve(false);
      return new Promise(resolve => { pending = { reason, resolve }; showConsent(); });
    };
  }

  global.SensorRewardAds = { createAccessController, language: () => 'ja' };
  if (typeof document !== 'undefined') {
    let storage;
    try { storage = global.localStorage; } catch { storage = null; }
    const controller = createAccessController({ storage, watchAd: createBrowserAdapter() });
    Object.assign(global.SensorRewardAds, {
      startup: () => controller.startup(),
      search: (kind, execute) => controller.search(kind, execute),
      snapshot: () => controller.snapshot()
    });
  }
})(window);
