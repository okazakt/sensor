/* OSM vector tiles use the OpenMapTiles schema. No Google drawing API is used here. */
(function (global) {
  'use strict';

  const ATTRIBUTION = '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a><br>Data from © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

  function createStyle(mode) {
    const day = mode === 'botw';
    const roadWidth = ['interpolate', ['exponential', 1.5], ['zoom'],
      5, 0.3, 12, 1.5, 16, 6, 19, 22];
    const majorWidth = ['interpolate', ['exponential', 1.5], ['zoom'],
      5, 0.7, 12, 3, 16, 10, 19, 30];
    const casingWidth = (width, border) => width.map((value, index) =>
      index >= 4 && index % 2 === 0 ? value + border : value);
    const line = (id, filter, color, width) => ({
      id, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': width }
    });
    const minor = ['all', ['!=', 'class', 'motorway'], ['!=', 'class', 'trunk'],
      ['!=', 'class', 'rail'], ['!=', 'class', 'transit'], ['!=', 'class', 'ferry']];
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
        { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
          paint: { 'fill-color': day ? '#38485c' : '#02070d' } },
        { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway',
          paint: { 'line-color': day ? '#38485c' : '#02070d', 'line-width': 2 } },
        { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
          paint: { 'fill-color': day ? '#453820' : '#081018', 'fill-outline-color': day ? '#483b23' : '#081018' } },
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
})(window);
