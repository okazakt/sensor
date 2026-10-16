/* Bounded, on-device runtime counters. No coordinates, place data or API URLs. */
(function initializeRuntimeDiagnostics(global) {
  'use strict';
  const KEY = 'sheikah_runtime_diagnostics_v1';
  const EVENTS = ['startup', 'js-error', 'promise-error', 'pagehide', 'pageshow', 'visible', 'hidden',
    'map.created', 'map.removed', 'map.center', 'map.slide', 'map.resize', 'map.error', 'map.context-lost', 'map.context-restored',
    'gps.fix', 'compass.event', 'sensor.cycle', 'search.request', 'search.response'];
  const PHASES = ['detected', 'saving', 'saved', 'map', 'presentation', 'challenge-feedback',
    'feedback', 'feedback-error', 'complete', 'failed', 'cancelled'];
  const allowed = new Set([...EVENTS, ...PHASES.map(phase => `arrival.${phase}`)]);
  const SAMPLE_KEYS = ['tracking', 'paused', 'searching', 'locationHistoryEntries',
    'geometryCacheEntries', 'geometryQueueEntries', 'audioState', 'soundMode', 'silentAudioPlaying'];
  let provider = () => ({});
  function read(key) {
    try {
      const raw = global.localStorage.getItem(key);
      if (!raw || raw.length > 16000) return null;
      const value = JSON.parse(raw);
      if (value?.schema !== 1) return null;
      const result = {};
      for (const key of ['schema', 'version', 'startedAt', 'updatedAt', 'uptimeSeconds', 'lifecycle', 'reloadReason', 'lastEvent', 'navigation', 'errorKind']) {
        if (['string', 'number'].includes(typeof value[key])) result[key] = value[key];
      }
      result.counters = {};
      for (const event of allowed) if (Number.isFinite(value.counters?.[event])) result.counters[event] = value.counters[event];
      result.sample = {};
      for (const key of SAMPLE_KEYS) if (['boolean', 'number', 'string'].includes(typeof value.sample?.[key])) result.sample[key] = value.sample[key];
      return result;
    } catch (_) { return null; }
  }
  const last = read(KEY);
  // An intentional startup/asset reload must not erase the run before it.
  const previous = last?.lifecycle === 'planned-reload' ? read(`${KEY}_previous`) : last;
  const startedAt = Date.now();
  const run = {schema:1, version:'loading', startedAt, updatedAt:startedAt, uptimeSeconds:0,
    lifecycle:'running', navigation:global.performance?.getEntriesByType?.('navigation')?.[0]?.type || 'unknown',
    lastEvent:'startup', counters:{startup:1}, sample:{}};
  try { if (previous) global.localStorage.setItem(`${KEY}_previous`, JSON.stringify(previous)); } catch (_) {}

  function persist() {
    run.updatedAt = Date.now();
    run.uptimeSeconds = Math.max(0, Math.floor((run.updatedAt - startedAt) / 1000));
    try {
      const sample = provider();
      run.sample = {};
      for (const key of SAMPLE_KEYS) if (['boolean', 'number', 'string'].includes(typeof sample[key])) run.sample[key] = sample[key];
    } catch (_) {}
    try { global.localStorage.setItem(KEY, JSON.stringify(run)); } catch (_) {}
  }
  function count(event) {
    if (allowed.has(event)) run.counters[event] = (run.counters[event] || 0) + 1;
  }
  function event(name) {
    if (!allowed.has(name)) return;
    count(name); run.lastEvent = name; persist();
  }
  function report() {
    persist();
    return JSON.stringify({previous, current:run,
      environment:{userAgent:global.navigator.userAgent,
        standalone:global.navigator.standalone === true || global.matchMedia?.('(display-mode: standalone)').matches === true,
        maplibre:global.maplibregl?.version || 'unavailable'}}, null, 2);
  }
  async function copy() {
    const text = report();
    try {
      await global.navigator.clipboard.writeText(text);
      global.alert('診断情報をコピーしました。調査担当者に貼り付けて送ってください。 / Diagnostics copied.');
    } catch (_) {
      global.prompt('診断情報をコピーしてください / Copy diagnostics', text);
    }
  }
  global.SensorRuntimeDiagnostics = {count, event, report,
    setVersion(version) { run.version = version; persist(); },
    setSnapshotProvider(callback) { provider = callback; persist(); },
    plannedReload(reason) {
      run.lifecycle = 'planned-reload';
      run.reloadReason = ['asset-update', 'startup-update'].includes(reason) ? reason : 'update';
      persist();
    }};
  function recordError(name, error) {
    run.errorKind = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'AbortError', 'QuotaExceededError']
      .includes(error?.name) ? error.name : 'unknown';
    event(name);
  }
  global.addEventListener('error', error => recordError('js-error', error.error), true);
  global.addEventListener('unhandledrejection', error => recordError('promise-error', error.reason));
  global.addEventListener('pagehide', () => {
    if (run.lifecycle !== 'planned-reload') run.lifecycle = 'pagehide';
    event('pagehide');
  });
  global.addEventListener('pageshow', () => { run.lifecycle = 'running'; event('pageshow'); });
  global.document.addEventListener('visibilitychange', () => event(global.document.visibilityState === 'hidden' ? 'hidden' : 'visible'));
  global.setInterval(() => { if (global.document.visibilityState === 'visible') persist(); }, 10000);
  global.document.querySelectorAll('.app-build-ver-span').forEach(element => {
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    element.setAttribute('title', '診断情報をコピー / Copy diagnostics');
    element.setAttribute('aria-label', '診断情報をコピー / Copy diagnostics');
    element.addEventListener('click', copy);
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); copy(); }
    });
  });
  persist();
})(window);
