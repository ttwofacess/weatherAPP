import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mountAppDom } from './helpers/fixtures.js';
import { createLeafletMock } from './helpers/leaflet-mock.js';

let log;

/**
 * map.js mantiene `map`, `marker` y `tempOverlayLayer` a nivel de módulo y usa
 * el global `L`. Cada test recarga el módulo con estado limpio.
 */
async function loadMap() {
    vi.resetModules();
    return import('../js/map.js');
}

beforeEach(() => {
    mountAppDom();
    const mock = createLeafletMock();
    log = mock.log;
    vi.stubGlobal('L', mock.L);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('updateMap — primera carga', () => {
    it('crea el mapa sobre #map y lo centra con zoom 10', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 40.4168, lon: -3.7038, name: 'Madrid' }, 'KEY');

        expect(log.maps).toHaveLength(1);
        expect(log.maps[0]._id).toBe('map');
        expect(log.setViews[0]).toEqual({ center: [40.4168, -3.7038], zoom: 10 });
    });

    it('añade la capa base de OpenStreetMap', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'X' }, 'KEY');

        const base = log.tileLayers.find(l => l._url.includes('openstreetmap.org'));
        expect(base).toBeDefined();
        expect(base._url).toBe('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
        expect(base._options.attribution).toContain('OpenStreetMap');
    });

    it('coloca un marcador en las coordenadas', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 40.4168, lon: -3.7038, name: 'Madrid' }, 'KEY');

        expect(log.markers[0]._coords).toEqual([40.4168, -3.7038]);
    });

    it('abre el popup con el nombre de la ciudad', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'Madrid' }, 'KEY');

        // el contenido es un nodo, no un string: Leaflet lo añade con appendChild
        const content = log.markers[0]._popup;
        expect(content).toBeInstanceOf(window.HTMLElement);
        expect(content.textContent).toBe('Madrid');
        expect(log.popupsOpened).toContain(log.markers[0]);
    });

    it('añade la capa de temperatura con la apiKey', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'X' }, 'KEY-ABC');

        const temp = log.tileLayers.find(l => l._url.includes('tile.openweathermap.org'));
        expect(temp._url).toBe(
            'https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=KEY-ABC'
        );
    });

    it('hace visible el contenedor #map', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'X' }, 'KEY');
        expect(document.getElementById('map').classList.contains('hidden')).toBe(false);
    });
});

describe('updateMap — búsquedas sucesivas', () => {
    it('NO crea un segundo mapa', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'A' }, 'KEY');
        updateMap({ lat: 3, lon: 4, name: 'B' }, 'KEY');
        expect(log.maps).toHaveLength(1);
    });

    it('re-centra el mapa con setView', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'A' }, 'KEY');
        updateMap({ lat: 3, lon: 4, name: 'B' }, 'KEY');

        expect(log.setViews).toHaveLength(2);
        expect(log.setViews[1]).toEqual({ center: [3, 4], zoom: 10 });
    });

    it('elimina el marcador anterior del mapa', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'A' }, 'KEY');
        const firstMarker = log.markers[0];
        updateMap({ lat: 3, lon: 4, name: 'B' }, 'KEY');

        expect(log.removedLayers).toContain(firstMarker);
    });

    it('NO duplica la capa base de OpenStreetMap', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'A' }, 'KEY');
        updateMap({ lat: 3, lon: 4, name: 'B' }, 'KEY');
        updateMap({ lat: 5, lon: 6, name: 'C' }, 'KEY');

        const base = log.tileLayers.filter(l => l._url.includes('openstreetmap.org'));
        expect(base).toHaveLength(1);
    });

    it('reemplaza la capa de temperatura anterior', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'A' }, 'KEY');
        const firstTemp = log.tileLayers.find(l => l._url.includes('temp_new'));
        updateMap({ lat: 3, lon: 4, name: 'B' }, 'KEY');

        expect(log.removedLayers).toContain(firstTemp);
    });

    it('NO acumula capas de temperatura', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'A' }, 'K');
        updateMap({ lat: 3, lon: 4, name: 'B' }, 'K');
        updateMap({ lat: 5, lon: 6, name: 'C' }, 'K');

        const temps = log.tileLayers.filter(l => l._url.includes('temp_new'));
        expect(temps).toHaveLength(3); // 3 creadas, pero solo la última en el mapa
        const removed = temps.slice(0, 2).every(l => log.removedLayers.includes(l));
        expect(removed).toBe(true);
    });

it('el nombre del popup se actualiza con cada búsqueda', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'Madrid' }, 'KEY');
        updateMap({ lat: 3, lon: 4, name: 'Lima' }, 'KEY');
        expect(log.markers[1]._popup.textContent).toBe('Lima');
    });
});

describe('updateMap — robustez', () => {
    it('BUG: lanza si Leaflet no está cargado (el global L es undefined)', async () => {
        const { updateMap } = await loadMap();
        vi.stubGlobal('L', undefined);
        expect(() => updateMap({ lat: 1, lon: 2, name: 'X' }, 'KEY')).toThrow();
    });

    it('BUG: no valida las coordenadas — NaN se propaga a Leaflet', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 'nope', lon: null, name: 'X' }, 'KEY');
        expect(log.setViews[0].center).toEqual(['nope', null]);
    });

    it('BUG: no valida coords.length ni tipos antes de updateMarker', async () => {
        const { updateMap } = await loadMap();
        expect(() => updateMap({}, 'KEY')).not.toThrow();
        expect(log.markers[0]._coords).toEqual([undefined, undefined]);
    });

    it('BUG: si #map no existe, L.map("map") sigue intentándolo', async () => {
        const { updateMap } = await loadMap();
        document.getElementById('map').remove();
        expect(() => updateMap({ lat: 1, lon: 2, name: 'X' }, 'KEY')).not.toThrow();
        expect(log.maps[0]._id).toBe('map');
    });

    it.each([
        '<img src=x onerror=alert(1)>',
        '"><script>alert(1)</script>',
        '<b>Madrid</b>',
        'Madrid & Co',
        "St. John's",
    ])('XSS CERRADO: el nombre va como nodo con textContent (%s)', async (name) => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name }, 'KEY');

        const content = log.markers[0]._popup;
        // nunca se parsea como HTML, así que no hay nodos que inyectar
        expect(content.children).toHaveLength(0);
        expect(content.querySelector('img')).toBeNull();
        expect(content.querySelector('b')).toBeNull();
        expect(content.querySelector('script')).toBeNull();
        // y se muestra literal
        expect(content.textContent).toBe(name);
    });

    it('map.js no necesita sanitizeHTML: no importa nada de utils.js', async () => {
        const src = await import('node:fs').then(fs =>
            fs.readFileSync(join(process.cwd(), 'js/map.js'), 'utf8'));
        expect(src).not.toContain('sanitizeHTML');
        // el escapado vive en el único sitio donde se construye HTML como string
        expect(src).not.toMatch(/\.bindPopup\(\s*cityName\s*\)/);
    });

    it('la apiKey viaja en la query string de la capa de temperatura', async () => {
        const { updateMap } = await loadMap();
        updateMap({ lat: 1, lon: 2, name: 'X' }, 'SECRET');
        expect(log.tileLayers.some(l => l._url.includes('appid=SECRET'))).toBe(true);
    });
});