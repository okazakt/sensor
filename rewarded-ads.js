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
    async function ensureAccess(requiredUnits = 1, reason = 'continue') {
      read();
      if (state.initialWatched && state.units >= requiredUnits) return true;
      if (!await watchAd(!state.initialWatched ? 'initial' : reason)) return false;
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
      async prepare() {
        if (busy) return false;
        busy = true;
        try { return await ensureAccess(); } finally { busy = false; }
      },
      async search(kind, execute, { requireFullCost = false } = {}) {
        if (busy) return false;
        busy = true;
        try {
          if (!await ensureAccess(requireFullCost ? (kind === 'secret' ? 5 : 2) : 1,
              requireFullCost ? 'research' : 'continue')) return false;
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
    const languageLabel = document.getElementById('rewarded-access-lang-label');
    const container = document.getElementById('applixir-ad-container');
    let pending = null;
    let sdkPromise = null;
    let playing = false;
    let attempt = 0;
    let timer = null;
    let consentError = '';
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

    function renderConsent() {
      if (!pending || playing) return;
      title.textContent = ja()
        ? (pending.reason === 'initial' ? '動画を見て利用を開始' : '動画を見て探索を続ける')
        : (pending.reason === 'initial' ? 'Watch a video to start' : 'Watch a video to continue');
      description.textContent = pending.reason === 'research'
        ? (ja() ? '再探索に必要なポイントが不足しています。動画を視聴して続けますか？「いいえ」を選ぶと現在の探索・チャレンジを終了します。'
          : 'You need more points to search again. Watch a video to continue? Choosing No ends the current search or challenge.')
        : (ja() ? '広告動画の視聴に同意し、視聴完了後に利用を続けます。'
          : 'Agree to watch a video ad and continue using the app after completing it.');
      cancel.textContent = pending.reason === 'research' ? (ja() ? 'いいえ' : 'No') : (ja() ? 'キャンセル' : 'Cancel');
      languageLabel.textContent = ja() ? '→EN' : '→JA';
      agree.textContent = consentError === 'loading'
        ? (ja() ? '読み込みを再試行' : 'Retry loading')
        : (ja() ? '同意して動画を見る' : 'Agree and watch');
      const messages = {
        incomplete: ja()
          ? '動画の視聴が完了していません。広告がない場合は、時間をおいて再試行してください。'
          : 'The video was not completed. If no ad is available, please try again later.',
        loading: ja() ? '広告を読み込めませんでした。もう一度お試しください。' : 'Could not load advertising. Please try again.',
        configuration: ja() ? '広告の設定が未完了です。' : 'Advertising is not configured.'
      };
      status.textContent = messages[consentError] || '';
    }

    function showConsent(error = '') {
      if (!pending) return;
      playing = false;
      consentError = error;
      renderConsent();
      agree.disabled = true;
      if (!dialog.open) dialog.showModal();
      if (!key()) {
        consentError = 'configuration';
        renderConsent();
        return;
      }
      const active = pending;
      loadSDK().then(() => {
        if (pending !== active || playing) return;
        agree.disabled = false;
      }).catch(() => {
        if (pending !== active) return;
        consentError = 'loading';
        renderConsent();
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
        showConsent('incomplete');
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
    const watchAd = reason => {
      if (pending) return Promise.resolve(false);
      return new Promise(resolve => { pending = { reason, resolve }; showConsent(); });
    };
    watchAd.refreshLanguage = renderConsent;
    return watchAd;
  }

  global.SensorRewardAds = { createAccessController, language: () => 'ja' };
  if (typeof document !== 'undefined') {
    let storage;
    try { storage = global.localStorage; } catch { storage = null; }
    const watchAd = createBrowserAdapter();
    const controller = createAccessController({ storage, watchAd });
    Object.assign(global.SensorRewardAds, {
      startup: () => controller.startup(),
      prepare: () => controller.prepare(),
      search: (kind, execute, options) => controller.search(kind, execute, options),
      snapshot: () => controller.snapshot(),
      refreshLanguage: () => watchAd.refreshLanguage()
    });
  }
})(window);
