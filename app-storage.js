/* IndexedDB persistence. Only lightweight summaries stay in memory. */
(function (global) {
  'use strict';
  const LEGACY_KEY = 'sheikah_db_v1';
  const MODE_KEY = 'sheikah_storage_mode';
  const DETAIL_FIELDS = ['geometry', 'formatted_address', 'phone', 'website'];
  const clone = value => structuredClone(value);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const empty = () => ({ keywordHistory: {}, arrivals: [] });
  function split(item) {
    const summary = { ...item }, detail = { id: item.id };
    delete summary.calcDistance;
    for (const key of DETAIL_FIELDS) {
      if (Object.hasOwn(summary, key)) detail[key] = summary[key];
      delete summary[key];
    }
    return { summary, detail };
  }
  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
      tx.onerror = () => {}; // onabort reports the transaction result.
    });
  }
  function result(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function create({ indexedDB = global.indexedDB, localStorage = global.localStorage,
    normalize = value => value, onError = () => {}, onChange = () => {} } = {}) {
    let connection, state = empty(), mode = 'pending', queue = Promise.resolve(), failed = false, revision = 0;
    const bases = new WeakMap();
    async function readStores() {
      const tx = connection.transaction(['summaries', 'management'], 'readonly');
      const done = transactionDone(tx);
      const [arrivals, management, version] = await Promise.all([
        result(tx.objectStore('summaries').getAll()), result(tx.objectStore('management').get('app')),
        result(tx.objectStore('management').get('revision')), done
      ]);
      return { data: { ...(management?.value || {}), arrivals }, revision: version?.value || 0 };
    }
    async function writeInitial(db) {
      const tx = connection.transaction(['summaries', 'details', 'detection', 'management'], 'readwrite');
      const done = transactionDone(tx);
      const marker = tx.objectStore('management').get('migration');
      marker.onsuccess = () => {
        if (marker.result) return;
        try {
          for (const store of ['summaries', 'details', 'detection']) tx.objectStore(store).clear();
          for (const item of db.arrivals) {
            const { summary, detail } = split(item);
            tx.objectStore('summaries').put(summary);
            tx.objectStore('details').put(detail);
            tx.objectStore('detection').put({ id: item.id, muted: Boolean(item.muted) });
          }
          const { arrivals, ...management } = db;
          tx.objectStore('management').put({ key: 'app', value: management });
          // Marker is committed atomically with all migrated records.
          tx.objectStore('management').put({ key: 'migration', value: { version: 1 } });
          tx.objectStore('management').put({ key: 'revision', value: 0 });
        } catch (error) { tx.abort(); }
      };
      await done;
    }
    async function initialize() {
      const legacy = () => normalize(JSON.parse(localStorage.getItem(LEGACY_KEY) || JSON.stringify(empty())));
      if (!indexedDB && localStorage.getItem(MODE_KEY) === 'indexeddb') throw new Error('IndexedDB is unavailable');
      if (!indexedDB || localStorage.getItem(MODE_KEY) === 'local') {
        state = legacy(); mode = 'local'; return;
      }
      try {
        connection = await new Promise((resolve, reject) => {
          const request = indexedDB.open('sensor_challenge_v1', 1);
          request.onupgradeneeded = () => {
            for (const name of ['summaries', 'details', 'detection']) request.result.createObjectStore(name, { keyPath: 'id' });
            request.result.createObjectStore('management', { keyPath: 'key' });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('Storage upgrade blocked by another tab'));
        });
        connection.onversionchange = () => { connection.close(); failed = true; onError(new Error('Storage changed in another tab')); };
        const tx = connection.transaction('management', 'readonly');
        const done = transactionDone(tx);
        const marker = await result(tx.objectStore('management').get('migration'));
        await done;
        if (!marker) await writeInitial(legacy());
        const persisted = await readStores();
        state = normalize(persisted.data); revision = persisted.revision;
        localStorage.setItem(MODE_KEY, 'indexeddb');
        mode = 'indexeddb';
      } catch (error) {
        connection?.close(); connection = null;
        if (localStorage.getItem(MODE_KEY) === 'indexeddb') throw error;
        state = legacy(); mode = 'local'; onError(error);
      }
    }
    function read() {
      if (mode === 'pending') throw new Error('Storage is not ready');
      const db = clone(mode === 'local' ? normalize(JSON.parse(localStorage.getItem(LEGACY_KEY) || JSON.stringify(empty()))) : state);
      bases.set(db, clone(db));
      return db;
    }
    function detection() {
      return (mode === 'local' ? read() : state).arrivals.map(({ id, muted }) => ({ id, muted }));
    }
    function save(db, { replace = false } = {}) {
      if (failed) return Promise.reject(new Error('Storage needs to be reloaded'));
      if (mode === 'local') {
        localStorage.setItem(LEGACY_KEY, JSON.stringify(db)); state = clone(db); return Promise.resolve();
      }
      const base = bases.get(db) || state;
      const before = clone(state), desired = clone(db);
      // Merge changes against the snapshot that the UI read, so an older open
      // list cannot overwrite unrelated changes made by another UI action.
      const oldItems = new Map(base.arrivals.map(item => [item.id, item]));
      const nextItems = new Map(state.arrivals.map(item => [item.id, item]));
      const incoming = new Set(desired.arrivals.map(item => item.id));
      for (const id of oldItems.keys()) if (!incoming.has(id)) nextItems.delete(id);
      const details = new Map();
      for (const item of desired.arrivals) {
        const original = oldItems.get(item.id);
        if (original && !nextItems.has(item.id) && !replace) continue; // Do not resurrect a deleted spot.
        const merged = { ...(nextItems.get(item.id) || {}) };
        for (const [key, value] of Object.entries(item)) {
          if (key === 'calcDistance') continue;
          if (DETAIL_FIELDS.includes(key)) {
            if (!original || !equal(original[key], value)) {
              const patch = details.get(item.id) || { id: item.id }; patch[key] = value; details.set(item.id, patch);
            }
          } else if (!original || !equal(original[key], value)) {
            if (original && ['keywords', 'challengeIds'].includes(key) && Array.isArray(value)) {
              const removed = new Set((original[key] || []).filter(entry => !value.includes(entry)));
              merged[key] = [...new Set([...(merged[key] || []).filter(entry => !removed.has(entry)), ...value])];
            } else merged[key] = value;
          }
        }
        nextItems.set(item.id, merged);
      }
      let next = { ...state, arrivals: [...nextItems.values()] };
      for (const key of Object.keys(desired)) {
        if (key === 'arrivals') continue;
        if (key === 'keywordHistory') {
          const history = { ...state.keywordHistory };
          for (const name of Object.keys(base.keywordHistory || {})) if (!Object.hasOwn(desired.keywordHistory || {}, name)) delete history[name];
          for (const [name, value] of Object.entries(desired.keywordHistory || {})) if (!equal(base.keywordHistory?.[name], value)) history[name] = value;
          next.keywordHistory = history;
        } else if (!equal(base[key], desired[key])) {
          if (key === 'completedChallenges' && Array.isArray(desired[key])) {
            const removed = new Set((base[key] || []).filter(id => !desired[key].includes(id)));
            next[key] = [...new Set([...(state[key] || []).filter(id => !removed.has(id)), ...desired[key]])];
          } else next[key] = desired[key];
        }
      }
      if (replace) {
        next = { ...desired, arrivals: desired.arrivals.map(item => split(item).summary) };
        details.clear(); for (const item of desired.arrivals) details.set(item.id, split(item).detail);
      }
      state = clone(next);
      const operation = queue.then(async () => {
        if (failed) throw new Error('A previous save failed');
        const tx = connection.transaction(['summaries', 'details', 'detection', 'management'], 'readwrite');
        const done = transactionDone(tx);
        const revisionRequest = tx.objectStore('management').get('revision');
        revisionRequest.onsuccess = () => {
          if ((revisionRequest.result?.value || 0) !== revision) {
            tx.abort();
            return;
          }
          try {
            if (replace) for (const name of ['summaries', 'details', 'detection']) tx.objectStore(name).clear();
            const previous = new Map(before.arrivals.map(item => [item.id, item]));
            for (const id of previous.keys()) if (!next.arrivals.some(item => item.id === id)) {
              for (const name of ['summaries', 'details', 'detection']) tx.objectStore(name).delete(id);
            }
            for (const item of next.arrivals) {
              const old = previous.get(item.id);
              if (replace || !equal(old, item)) tx.objectStore('summaries').put(item);
              if (replace || !old || old.muted !== item.muted) tx.objectStore('detection').put({ id: item.id, muted: Boolean(item.muted) });
            }
            for (const [id, patch] of details) {
              const store = tx.objectStore('details');
              const request = store.get(id);
              request.onsuccess = () => store.put({ ...(replace ? {} : request.result), ...patch });
            }
            const { arrivals: ignoredBefore, ...oldManagement } = before;
            const { arrivals: ignoredNext, ...management } = next;
            if (replace || !equal(oldManagement, management)) tx.objectStore('management').put({ key: 'app', value: management });
            tx.objectStore('management').put({ key: 'revision', value: revision + 1 });
          } catch (error) { tx.abort(); }
        };
        await done;
        revision++;
        onChange();
      });
      queue = operation.catch(async error => {
        failed = true;
        try { const persisted = await readStores(); state = normalize(persisted.data); revision = persisted.revision; } catch (_) { state = before; }
        onError(error);
      });
      return operation;
    }
    async function detail(id) {
      await queue;
      if (mode === 'local') return read().arrivals.find(item => item.id === id);
      const tx = connection.transaction('details', 'readonly');
      const done = transactionDone(tx);
      const data = await result(tx.objectStore('details').get(id)); await done;
      const summary = state.arrivals.find(item => item.id === id);
      return summary ? { ...clone(summary), ...data } : undefined;
    }
    async function exportData() {
      await queue;
      if (failed) throw new Error('Storage needs to be reloaded');
      if (mode === 'local') return read();
      const tx = connection.transaction(['summaries', 'details', 'management'], 'readonly');
      const done = transactionDone(tx);
      const [arrivals, all, management] = await Promise.all([
        result(tx.objectStore('summaries').getAll()), result(tx.objectStore('details').getAll()),
        result(tx.objectStore('management').get('app')), done
      ]);
      const details = new Map(all.map(item => [item.id, item]));
      return { ...(management?.value || {}), arrivals: arrivals.map(item => ({ ...item, ...details.get(item.id) })) };
    }
    async function rollbackToLocalStorage() {
      const db = await exportData();
      // If this exceeds localStorage quota, mode stays unchanged and IDB is retained.
      localStorage.setItem(LEGACY_KEY, JSON.stringify(db));
      localStorage.setItem(MODE_KEY, 'local');
      state = clone(db); mode = 'local'; connection?.close();
      return db.arrivals.length;
    }
    return { initialize, read, detection, save, detail, exportData, rollbackToLocalStorage,
      flush: () => queue, get mode() { return mode; } };
  }
  global.SensorStorage = { create };
})(typeof window === 'undefined' ? globalThis : window);
