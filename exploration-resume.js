/* Recovery snapshots share the rewarded-access record with their paid balance. */
(function (global) {
  'use strict';
  const RADII = [200,1000,3000,10000,50000,100000];
  const TARGET_MODES = ['nearest','random','all'];
  const SENSOR_MODES = ['standard','detailed'];
  const PHASES = ['waiting','searching','ready','failed'];
  function create({ access, capture:source, blocked = () => false, completed = () => [],
    validateGeometry = () => false, validateChallenge = () => true, onError = () => {} }) {
    let warned = false;
    const fail = () => { if (!warned) { warned = true; onError(); } };
    function position(value, nullable = true) {
      if (value == null && nullable) return null;
      if (!value || !Number.isFinite(value.lat) || !Number.isFinite(value.lng) || Math.abs(value.lat)>90 || Math.abs(value.lng)>180) throw Error('Invalid position');
      return {lat:value.lat,lng:value.lng};
    }
    function place(value) {
      if (!value || typeof value.id!=='string' || !value.id || value.id.length>1024 ||
          typeof value.name!=='string' || value.name.length>2000) throw Error('Invalid place');
      const result = {id:value.id,name:value.name,...position(value,false)};
      for (const key of ['branch','brand','formatted_address','phone','website']) {
        if (typeof value[key]==='string') result[key]=value[key].slice(0,4096);
      }
      if (value.placeDetailsVersion===1) result.placeDetailsVersion=1;
      if (value.geometry != null) {
        if (!validateGeometry(value.geometry)) throw Error('Invalid geometry');
        result.geometry=value.geometry;
      }
      return result;
    }
    function normalize(value) {
      if (value==null) return null;
      if (value.schema!==1 || typeof value.id!=='string' || !value.id || value.id.length>100 ||
          !Number.isFinite(value.startedAt) || value.startedAt<=0 ||
          typeof value.keyword!=='string' || !value.keyword.trim() || value.keyword.length>1000 ||
          !RADII.includes(value.radius) || !TARGET_MODES.includes(value.targetMode) ||
          !SENSOR_MODES.includes(value.sensorDetail) || !PHASES.includes(value.phase) ||
          !Array.isArray(value.places) || value.places.length>500) throw Error('Invalid recovery snapshot');
      const settings=value.challengeSettings;
      if (value.challengeId != null && (typeof value.challengeId!=='string' || !validateChallenge(value.challengeId) ||
          !settings || !TARGET_MODES.includes(settings.targetMode) || !SENSOR_MODES.includes(settings.sensorDetail) ||
          !Number.isInteger(settings.radiusIndex) || !RADII[settings.radiusIndex])) throw Error('Invalid challenge');
      const places=value.places.map(place);
      if (new Set(places.map(item => item.id)).size!==places.length) throw Error('Duplicate places');
      for (const key of ['randomTargetId','pinpointTargetId']) {
        if (value[key]!=null && !places.some(item => item.id===value[key])) throw Error('Missing target');
      }
      const result={schema:1,id:value.id,startedAt:value.startedAt,keyword:value.keyword,
        radius:value.radius,targetMode:value.targetMode,sensorDetail:value.sensorDetail,
        phase:value.phase,paused:value.paused===true,challengeId:value.challengeId || null,
        challengeSettings:value.challengeId ? {targetMode:settings.targetMode,sensorDetail:settings.sensorDetail,radiusIndex:settings.radiusIndex} : null,
        places,searchOrigin:position(value.searchOrigin),randomTargetOrigin:position(value.randomTargetOrigin),
        randomTargetArrivalFallback:value.randomTargetArrivalFallback===true,
        randomTargetId:value.randomTargetId || null,pinpointTargetId:value.pinpointTargetId || null,
        detailsResolvedIds:[...new Set((Array.isArray(value.detailsResolvedIds) ? value.detailsResolvedIds : [])
          .filter(id => places.some(item => item.id===id)))]};
      const serialized=JSON.stringify(result);
      if (serialized.length>500000) throw Error('Recovery snapshot too large');
      return JSON.parse(serialized);
    }
    function capture() { return normalize(source()); }
    function checkpoint() {
      if (blocked()) return;
      try {
        const value=capture();
        if (!value) return;
        if (!access.saveExploration(value)) fail(); else warned=false;
      } catch (_) {
        access.saveExploration(null);
        fail();
      }
    }
    function load() {
      try {
        const value=normalize(access.loadExploration());
        if (value && completed().includes(value.id)) { clear(); return null; }
        return value;
      } catch (_) { clear(); return null; }
    }
    function clear() { if (!access.saveExploration(null)) fail(); }
    return {capture,checkpoint,load,clear,onError:fail};
  }
  global.SensorExplorationResume={create};
})(window);
