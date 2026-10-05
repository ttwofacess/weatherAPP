import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { jsonResponse } from './helpers/fixtures.js';

/**
 * api.js guarda la API key y el flag de error en el scope del módulo, sin ningún
 * export para resetearlos. Cada test importa el módulo de forma fresca para
 * partir siempre de estado limpio.
 */
async function loadApi() {
    vi.resetModules();
    return import('../js/api.js');
}

let fetchSpy;
let consoleErrorSpy;
let consoleLogSpy;

beforeEach(() => {
    localStorage.setItem('weatherapp_lang', 'es');
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('fetchApiKey — éxito', () => {
    it('devuelve la apiKey del endpoint /api/config', async () => {
        const { fetchApiKey } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ apiKey: 'KEY-123' }));

        await expect(fetchApiKey()).resolves.toBe('KEY-123');
    });

    it('pide el endpoint correcto', async () => {
        const { fetchApiKey } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ apiKey: 'K' }));
        await fetchApiKey();
        expect(fetchSpy).toHaveBeenCalledWith('/api/config', expect.any(Object));
    });

    it('cachea la key: la segunda llamada no vuelve a pedirla', async () => {
        const { fetchApiKey } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ apiKey: 'KEY-123' }));

        await fetchApiKey();
        await fetchApiKey();

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('getApiKey() expone la key cacheada', async () => {
        const { fetchApiKey, getApiKey } = await loadApi();
        expect(getApiKey()).toBeNull();
        fetchSpy.mockResolvedValue(jsonResponse({ apiKey: 'KEY-123' }));
        await fetchApiKey();
        expect(getApiKey()).toBe('KEY-123');
    });

    it('hasApiKeyError() es false tras un éxito', async () => {
        const { fetchApiKey, hasApiKeyError } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ apiKey: 'K' }));
        await fetchApiKey();
        expect(hasApiKeyError()).toBe(false);
    });
});

describe('fetchApiKey — errores', () => {
    it('lanza si la respuesta no es ok, incluyendo el status', async () => {
        const { fetchApiKey } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ error: 'boom' }, { ok: false, status: 500 }));

        await expect(fetchApiKey()).rejects.toThrow('Failed to fetch API key config: 500 boom');
    });

    it('lanza si falta apiKey en la respuesta', async () => {
        const { fetchApiKey } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ nope: 1 }));

        await expect(fetchApiKey()).rejects.toThrow('API key not found in server response.');
    });

    it('no presenta UI: no llama a alert(), solo propaga el error', async () => {
        // Un módulo de datos no debería decidir cómo avisar al usuario.
        // main.js muestra el aviso en la página.
        const { fetchApiKey } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
        await expect(fetchApiKey()).rejects.toThrow();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('no toca el DOM en ningún camino', async () => {
        const { fetchApiKey } = await loadApi();
        const spy = vi.spyOn(document, 'getElementById');
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
        await expect(fetchApiKey()).rejects.toThrow();
        expect(spy).not.toHaveBeenCalled();
    });

    it('el estado de error es pegajoso a propósito: no reintenta', async () => {
        const { fetchApiKey, hasApiKeyError } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
        await expect(fetchApiKey()).rejects.toThrow();
        expect(hasApiKeyError()).toBe(true);

        // Decisión de producto: avisar una vez y no reintentar. /api/config
        // fallando casi siempre significa variable de entorno sin configurar,
        // así que reintentar solo genera más peticiones fallidas.
        fetchSpy.mockClear();
        await expect(fetchApiKey()).rejects.toThrow('Previously failed to fetch API key.');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('el error pegajoso tampoco dispara alert en intentos posteriores', async () => {
        const { fetchApiKey } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
        await expect(fetchApiKey()).rejects.toThrow();
        await expect(fetchApiKey()).rejects.toThrow();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('BUG: si el body de error no es JSON, el mensaje incluye un hueco', async () => {
        const { fetchApiKey } = await loadApi();
        fetchSpy.mockResolvedValue({
            ok: false,
            status: 502,
            json: () => Promise.reject(new SyntaxError('Unexpected token <')),
        });
        await expect(fetchApiKey()).rejects.toThrow('Failed to fetch API key config: 502 ');
    });

    it('el fallo de red también envenena el módulo', async () => {
        const { fetchApiKey, hasApiKeyError } = await loadApi();
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(fetchApiKey()).rejects.toThrow('Failed to fetch');
        expect(hasApiKeyError()).toBe(true);
    });
});

describe('fetchWeather', () => {
    beforeEach(() => {
        localStorage.setItem('weatherapp_lang', 'es');
    });

    it('construye la URL con units=metric y el appid', async () => {
        const { fetchWeather } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ cod: 200 }));

        await fetchWeather('Madrid', 'KEY', 'es');

        const url = fetchSpy.mock.calls[0][0];
        expect(url).toContain('q=Madrid');
        expect(url).toContain('units=metric');
        expect(url).toContain('lang=es');
        expect(url).toContain('appid=KEY');
    });

    it('URL-encoda el nombre de la ciudad', async () => {
        const { fetchWeather } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ cod: 200 }));

        await fetchWeather('A Coruña, ES', 'KEY', 'es');

        expect(fetchSpy.mock.calls[0][0]).toContain('q=A%20Coru%C3%B1a%2C%20ES');
    });

    it('devuelve el JSON parseado', async () => {
        const { fetchWeather } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ name: 'Madrid', cod: 200 }));

        await expect(fetchWeather('Madrid', 'K', 'es')).resolves.toEqual({ name: 'Madrid', cod: 200 });
    });

    it('traduce el 401 al mensaje "unauthorized"', async () => {
        const { fetchWeather } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));

        await expect(fetchWeather('Madrid', 'K', 'es')).rejects.toThrow(
            'API key inválida o no autorizada por OpenWeatherMap.'
        );
    });

    it('traduce el 404 al mensaje "cityNotFound"', async () => {
        const { fetchWeather } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 404 }));

        await expect(fetchWeather('Nowhere', 'K', 'es')).rejects.toThrow(
            'Ciudad no encontrada por OpenWeatherMap.'
        );
    });

    it('encapsula cualquier otro status en httpError', async () => {
        const { fetchWeather } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 429 }));

        await expect(fetchWeather('Madrid', 'K', 'es')).rejects.toThrow(
            'Error HTTP de OpenWeatherMap: 429'
        );
    });

    it('usa el idioma activo para el mensaje de error', async () => {
        localStorage.setItem('weatherapp_lang', 'en');
        const { fetchWeather } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 404 }));

        await expect(fetchWeather('Nowhere', 'K', 'en')).rejects.toThrow(
            'City not found by OpenWeatherMap.'
        );
    });

    it('BUG: la key viaja en la query string (queda en el historial y en los logs)', async () => {
        const { fetchWeather } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ cod: 200 }));

        await fetchWeather('Madrid', 'SECRET-KEY', 'es');

        expect(fetchSpy.mock.calls[0][0]).toContain('appid=SECRET-KEY');
    });
});

describe('fetchForecast', () => {
    it('construye la URL de forecast', async () => {
        const { fetchForecast } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({ cod: '200' }));

        await fetchForecast('Madrid', 'KEY', 'en');

        const url = fetchSpy.mock.calls[0][0];
        expect(url).toContain('/data/2.5/forecast');
        expect(url).toContain('lang=en');
    });

    it('devuelve el JSON parseado', async () => {
        const { fetchForecast } = await loadApi();
        const payload = { cod: '200', list: [] };
        fetchSpy.mockResolvedValue(jsonResponse(payload));

        await expect(fetchForecast('Madrid', 'K', 'es')).resolves.toEqual(payload);
    });

    it('lanza el mensaje genérico de forecast en cualquier error', async () => {
        const { fetchForecast } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));

        await expect(fetchForecast('Madrid', 'K', 'es')).rejects.toThrow(
            'Error al obtener el pronóstico de OpenWeatherMap.'
        );
    });

    it('BUG: no distingue 404 (ciudad no encontrada) ni 401 (key inválida)', async () => {
        // A diferencia de fetchWeather, aquí un 401 se reporta como error genérico,
        // así que el usuario ve "Error al obtener el pronóstico" en vez de
        // "API key inválida", que sería el mensaje accionable.
        const { fetchForecast } = await loadApi();
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));

        await expect(fetchForecast('Madrid', 'K', 'es')).rejects.not.toThrow(/API key/);
    });
});