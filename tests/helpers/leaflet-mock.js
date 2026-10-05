// tests/helpers/leaflet-mock.js — Doble de Leaflet para poder testear map.js en jsdom

/**
 * Leaflet real necesita un DOM con dimensions reales (offsetWidth/Height) y
 * manipula event listeners de forma que jsdom no soporta bien. Este doble
 * registra las llamadas en un log para poder afirmar sobre ellas.
 */
export function createLeafletMock() {
    const log = {
        maps: [],
        setViews: [],
        tileLayers: [],
        markers: [],
        popupsOpened: [],
        removedLayers: [],
        addedLayers: [],
    };

    const makeLayer = (kind, extra = {}) => {
        const layer = {
            _kind: kind,
            _map: null,
            ...extra,
            addTo(map) { layer._map = map; log.addedLayers.push(layer); return layer; },
            remove() { return layer; },
            bindPopup(content) { layer._popup = content; return layer; },
            openPopup() { log.popupsOpened.push(layer); return layer; },
        };
        return layer;
    };

    const L = {
        map: (id) => {
            const mapObj = {
                _id: id,
                setView(center, zoom) {
                    log.setViews.push({ center, zoom });
                    log.maps[log.maps.length - 1]._view = { center, zoom };
                    return mapObj;
                },
                removeLayer(layer) { log.removedLayers.push(layer); return mapObj; },
                hasLayer(layer) { return log.addedLayers.includes(layer); },
            };
            log.maps.push(mapObj);
            return mapObj;
        },
        tileLayer: (url, opts) => {
            const layer = makeLayer('tileLayer', { _url: url, _options: opts });
            log.tileLayers.push(layer);
            return layer;
        },
        marker: (coords) => {
            const layer = makeLayer('marker', { _coords: coords });
            log.markers.push(layer);
            return layer;
        },
    };

    return { L, log };
}