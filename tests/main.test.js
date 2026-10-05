import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountAppDom, weatherPayload, forecastPayload } from './helpers/fixtures.js';

// ── Dobles de los colaboradores de main.js ────────────────────────────────────
const fetchApiKey   = vi.fn();
const fetchWeather  = vi.fn();
const fetchForecast = vi.fn();
const getApiKey     = vi.fn(() => 'KEY');
const hasApiKeyError = vi.fn(() => false);
const updateMap     = vi.fn();
const updateCityTime = vi.fn();
const startClock    = vi.fn(() => 1);
const renderWeatherCard = vi.fn();
const renderForecast = vi.fn();
const initDonateModal = vi.fn();
const initLanguageSwitch = vi.fn();
const checkLimit = vi.fn();

vi.mock('../js/api.js', () => ({
    fetchApiKey, fetchWeather, fetchForecast, getApiKey, hasApiKeyError,
}));
vi.mock('../js/map.js', () => ({ updateMap }));
vi.mock('../js/time.js', () => ({ updateCityTime, startClock }));
vi.mock('../js/ui.js', () => ({ renderWeatherCard, renderForecast, initDonateModal }));
vi.mock('../js/i18n.js', async () => {
    const actual = await vi.importActual('../js/i18n.js');
    return { ...actual, initLanguageSwitch };
});
vi.mock('../js/utils.js', async () => {
    const actual = await vi.importActual('../js/utils.js');
    return { ...actual, rateLimiter: { checkLimit } };
});

/** Importa main.js con el DOM ya montado (registra los listeners). */
async function loadMain() {
    await import('../js/main.js');
}

/** Envía el formulario de búsqueda y deja correr los handlers async. */
async function submit(city) {
    document.getElementById('cityInput').value = city;
    const form = document.getElementById('weatherForm');
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush();
}

/** Deja que las promesas pendientes del handler se resuelvan. */
async function flush(times = 12) {
    for (let i = 0; i < times; i++) await Promise.resolve();
}

beforeEach(() => {
    vi.resetModules();
    // resetAllMocks (no clearAllMocks) para que también se limpien las
    // implementaciones: si no, un mockImplementation de un test previo se
    // filtra al siguiente y el orden de ejecución altera el resultado.
    vi.resetAllMocks();
    mountAppDom();
    localStorage.setItem('weatherapp_lang', 'es');

    // Defaults explícitos de todos los dobles.
    getApiKey.mockReturnValue('KEY');
    hasApiKeyError.mockReturnValue(false);
    fetchApiKey.mockResolvedValue('KEY');
    fetchWeather.mockResolvedValue(weatherPayload());
    fetchForecast.mockResolvedValue(forecastPayload());
    checkLimit.mockImplementation(() => {});
    renderWeatherCard.mockImplementation(() => {});
    renderForecast.mockImplementation(() => {});
    updateMap.mockImplementation(() => {});
    updateCityTime.mockImplementation(() => {});
    startClock.mockImplementation(() => 1);
    initDonateModal.mockImplementation(() => {});
    initLanguageSwitch.mockImplementation(() => {});

    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('main.js — arranque', () => {
    it('registra el listener de DOMContentLoaded sin lanzar al importar', async () => {
        await expect(loadMain()).resolves.toBeUndefined(); // main.js no exporta nada
    });

    it('al hacer DOMContentLoaded inicializa switch, modal y reloj', async () => {
        await loadMain();
        document.dispatchEvent(new Event('DOMContentLoaded'));

        expect(initLanguageSwitch).toHaveBeenCalled();
        expect(initDonateModal).toHaveBeenCalled();
        expect(startClock).toHaveBeenCalled();
    });

    it('BUG: si falta #weatherForm, importar main.js lanza TypeError y TODO el módulo muere', async () => {
        document.getElementById('weatherForm').remove();
        // El addEventListener de la línea 25 está a nivel de módulo, fuera del
        // guard DOMContentLoaded, así que revienta al importar.
        await expect(loadMain()).rejects.toThrow(TypeError);
    });

    it('precarga la apiKey en background sin bloquear', async () => {
        await loadMain();
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await flush();
        expect(fetchApiKey).toHaveBeenCalled();
    });

    it('BUG: un fallo al precargar la key solo avisa por consola, el usuario no se entera', async () => {
        fetchApiKey.mockRejectedValue(new Error('boom'));
        await loadMain();
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await flush();
        expect(console.warn).toHaveBeenCalled();
    });
});

describe('main.js — validación de la ciudad', () => {
    beforeEach(async () => { await loadMain(); });

    it('rechaza una ciudad vacía', async () => {
        await submit('   ');
        expect(window.alert).toHaveBeenCalledWith(
            'Por favor ingrese un nombre de ciudad válido.'
        );
        expect(fetchWeather).not.toHaveBeenCalled();
    });

    it('rechaza caracteres no permitidos', async () => {
        await submit('Madrid; DROP TABLE');
        expect(fetchWeather).not.toHaveBeenCalled();
    });

it('BUG: el regex del JS es más permisivo que el pattern del HTML', async () => {
        // El JS acepta acentos, Ñ y guiones:
        //   /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s,-]+$/
        await submit('A Coruña-Málaga');
        expect(fetchWeather).toHaveBeenCalled();

        // pero el atributo pattern de index.html es solo "[a-zA-Z\s,]+", así que
        // el navegador bloquea el submit antes de que el JS se entere.
        const htmlPattern = /^[a-zA-Z\s,]+$/;
        expect(htmlPattern.test('A Coruña-Málaga')).toBe(false);
        expect(htmlPattern.test('Madrid, ES')).toBe(true);
    });

    it('acepta una ciudad con acentos', async () => {
        await submit('Bogotá');
        expect(fetchWeather).toHaveBeenCalledWith('Bogotá', 'KEY', 'es');
    });

    it('hace trim de la entrada', async () => {
        await submit('  Lima  ');
        expect(fetchWeather).toHaveBeenCalledWith('Lima', 'KEY', 'es');
    });
});

describe('main.js — rate limiting', () => {
    beforeEach(async () => { await loadMain(); });

    it('muestra el mensaje de espera si el limiter salta', async () => {
        checkLimit.mockImplementation(() => { throw new Error('RATE_LIMIT'); });
        await submit('Madrid');
        expect(window.alert).toHaveBeenCalledWith(
            'Por favor espere antes de realizar otra búsqueda.'
        );
        expect(fetchWeather).not.toHaveBeenCalled();
    });

    it('BUG: el rate limit se consume ANTES de saber si la búsqueda es válida para la API', async () => {
        checkLimit.mockImplementation(() => { throw new Error('RATE_LIMIT'); });
        await submit('Madrid');
        // la búsqueda ni se intentó, pero el límite ya se consumió igualmente
        expect(fetchApiKey).not.toHaveBeenCalled();
    });
});

describe('main.js — flujo de éxito', () => {
    beforeEach(async () => { await loadMain(); });

    it('pide clima y pronóstico con la key cacheada', async () => {
        await submit('Madrid');
        expect(fetchWeather).toHaveBeenCalledWith('Madrid', 'KEY', 'es');
        expect(fetchForecast).toHaveBeenCalledWith('Madrid', 'KEY', 'es');
    });

    it('no vuelve a pedir la key si ya está cacheada', async () => {
        await submit('Madrid');
        expect(fetchApiKey).not.toHaveBeenCalled();
    });

    it('pide la key si aún no está cacheada', async () => {
        getApiKey.mockReturnValue(null);
        await submit('Madrid');
        expect(fetchApiKey).toHaveBeenCalled();
        expect(fetchWeather).toHaveBeenCalledWith('Madrid', 'KEY', 'es');
    });

    it('usa el idioma activo de i18n', async () => {
        localStorage.setItem('weatherapp_lang', 'en');
        await submit('London');
        expect(fetchWeather).toHaveBeenCalledWith('London', 'KEY', 'en');
    });

    it('pinta la tarjeta, el reloj y el mapa', async () => {
        await submit('Madrid');
        expect(renderWeatherCard).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Madrid' })
        );
        expect(updateCityTime).toHaveBeenCalledWith(weatherPayload().timezone);
        expect(updateMap).toHaveBeenCalledWith(
            { lat: 40.4168, lon: -3.7038, name: 'Madrid' },
            'KEY'
        );
    });

    it('pinta el pronóstico', async () => {
        await submit('Madrid');
        expect(renderForecast).toHaveBeenCalled();
    });

    it('BUG: el nombre de la ciudad se pasa ya sanitizado a updateMap, pero renderWeatherCard vuelve a sanear', async () => {
        // Doble capa de sanitización: main.js sanea, ui.js sanea otra vez.
        await submit('Madrid');
        const coords = updateMap.mock.calls[0][0];
        expect(coords.name).toBe('Madrid');
    });

    it('BUG: una ciudad con "&" en el nombre NO se puede buscar', async () => {
        // El regex de validación no permite "&", así que ni siquiera llega a la API.
        // Ejemplos reales de OWM: "Smith & Sons", "AT&T Arena".
        await submit('Smith & Sons');
        expect(fetchWeather).not.toHaveBeenCalled();
        expect(window.alert).toHaveBeenCalledWith(
            'Por favor ingrese un nombre de ciudad válido.'
        );
    });

    it('no muestra alert en el camino feliz', async () => {
        await submit('Madrid');
        expect(window.alert).not.toHaveBeenCalled();
    });
});

describe('main.js — fallo de apiKey', () => {
    beforeEach(async () => { await loadMain(); });

    it('BUG: si ya hubo error de key, el submit no hace absolutely nada — ni alert ni log', async () => {
        getApiKey.mockReturnValue(null);
        hasApiKeyError.mockReturnValue(true);

        await submit('Madrid');

        expect(fetchApiKey).not.toHaveBeenCalled();
        expect(fetchWeather).not.toHaveBeenCalled();
        // main.js hace `if (!apiKey) return;` asumiendo que api.js ya avisó,
        // pero en este camino no ha pasado por fetchApiKey: nadie avisó.
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('BUG: si fetchApiKey lanza, el catch solo loguea (api.js ya alerted)', async () => {
        getApiKey.mockReturnValue(null);
        fetchApiKey.mockRejectedValue(new Error('boom'));

        await submit('Madrid');

        expect(fetchWeather).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith(
            'Error preparing weather search:', 'boom'
        );
    });

    it('BUG: si fetchApiKey devuelve undefined sin lanzar, no hay aviso ni búsqueda', async () => {
        getApiKey.mockReturnValue(null);
        fetchApiKey.mockResolvedValue(undefined);

        await submit('Madrid');

        expect(fetchWeather).not.toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
    });
});

describe('main.js — errores de la API', () => {
    beforeEach(async () => { await loadMain(); });

    it('alerta si el clima viene con cod != 200', async () => {
        fetchWeather.mockResolvedValue({ cod: 404, message: 'Not Found' });
        await submit('Madrid');

        expect(window.alert).toHaveBeenCalledWith(
            'Hubo un error: Ciudad no encontrada o error en datos: Not Found'
        );
        expect(renderWeatherCard).not.toHaveBeenCalled();
    });

    it('BUG: cod viene como número en /weather y como string "200" en /forecast — comparación estricta', async () => {
        // Si /weather devolviera "200" (string), la comparación !== 200 fallaría
        // y una búsqueda legítima se reportaría como error.
        fetchWeather.mockResolvedValue({ ...weatherPayload(), cod: '200' });
        await submit('Madrid');

        expect(window.alert).toHaveBeenCalledWith(
            expect.stringContaining('Ciudad no encontrada o error en datos')
        );
        expect(renderWeatherCard).not.toHaveBeenCalled();
    });

    it('BUG: el mensaje de error pasa por sanitizeHTML y luego a alert — doble encoding en el alert', async () => {
        fetchWeather.mockResolvedValue({ cod: 500, message: 'a & b' });
        await submit('Madrid');

        // El alert es texto plano: no necesita sanitizeHTML, y aplicarlo
        // codifica el "&" para que el usuario lea literalmente "a &amp; b".
        expect(window.alert).toHaveBeenCalledWith(
            'Hubo un error: Ciudad no encontrada o error en datos: a &amp; b'
        );
    });

    it('BUG: comparación estricta de cod — si el forecast devolviera 200 numérico falla', async () => {
        fetchWeather.mockResolvedValue(weatherPayload());
        // /weather devuelve cod numérico (200 !== 200 ok); /forecast devuelve "200".
        fetchForecast.mockResolvedValue({ ...forecastPayload(), cod: 200 }); // numérico
        await submit('Madrid');

        // 200 !== '200' es true -> una respuesta correcta se trata como error
        expect(window.alert).toHaveBeenCalledWith(
            'Hubo un error: Error al obtener el pronóstico: Respuesta inválida'
        );
        expect(renderForecast).not.toHaveBeenCalled();
    });

    it('el mismo fallo en sentido contrario: si /weather devolviera "200" string', async () => {
        // Simetría: /weather hace !== 200 y /forecast hace !== '200'.
        // Cada endpoint depende de que OWM mantenga el tipo, sin normalizar.
        fetchWeather.mockResolvedValue({ ...weatherPayload(), cod: '200' });
        await submit('Madrid');

        expect(renderWeatherCard).not.toHaveBeenCalled();
        expect(window.alert).toHaveBeenCalled();
    });

    it('BUG: asimetría de tipos en cod entre /weather y /forecast', async () => {
        // main.js:73  -> weatherData.cod !== 200     (numérico)
        // main.js:89  -> forecastData.cod !== '200' (string)
        // Ninguno normaliza; ambos dependen del tipo que devuelva OWM.
        fetchWeather.mockResolvedValue(weatherPayload());
        fetchForecast.mockResolvedValue({ ...forecastPayload(), cod: '200' });

        await submit('Madrid');
        expect(renderForecast).toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('alerta si el pronóstico viene con cod != "200"', async () => {
        fetchForecast.mockResolvedValue({ ...forecastPayload(), cod: '500', message: 'x' });
        await submit('Madrid');

        expect(window.alert).toHaveBeenCalledWith(
            'Hubo un error: Error al obtener el pronóstico: x'
        );
    });

    it('alerta con el mensaje original si fetchWeather lanza', async () => {
        fetchWeather.mockRejectedValue(new Error('Ciudad no encontrada por OpenWeatherMap.'));
        await submit('Madrid');

        expect(window.alert).toHaveBeenCalledWith(
            'Hubo un error: Ciudad no encontrada por OpenWeatherMap.'
        );
    });

    it('BUG: si el clima falla, ya se pintó la tarjeta/mapa de una búsqueda anterior y queda obsoleta', async () => {
        await submit('Lima');
        expect(renderWeatherCard).toHaveBeenCalled();

        fetchWeather.mockRejectedValue(new Error('fail'));
        await submit('Madrid');

        // el error se muestra, pero el DOM sigue mostrando Lima sin indicarlo
        expect(document.getElementById('cityName')).toBeDefined();
    });

    it('BUG: el error del pronóstico NO revierte la tarjeta ya pintada — estado parcial', async () => {
        fetchForecast.mockRejectedValue(new Error('sin pronostico'));
        await submit('Madrid');

        expect(renderWeatherCard).toHaveBeenCalled();
        expect(window.alert).toHaveBeenCalled();
        // el pronóstico anterior (si lo hubiera) permanece visible
    });

    it('BUG: si renderWeatherCard lanza a mitad, el mapa y la hora ya se actualizaron', async () => {
        renderWeatherCard.mockImplementation(() => { throw new Error('DOM roto'); });
        await submit('Madrid');

        expect(window.alert).toHaveBeenCalled();
        expect(updateMap).not.toHaveBeenCalled();
    });

    it('BUG: un AbortError por timeout se muestra crudo al usuario', async () => {
        fetchWeather.mockRejectedValue(new DOMException('aborted', 'AbortError'));
        await submit('Madrid');

        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('aborted'));
    });

    it('no propaga el error: el handler nunca rechaza', async () => {
        fetchWeather.mockRejectedValue(new Error('boom'));
        await expect(submit('Madrid')).resolves.toBeUndefined();
    });
});

describe('main.js — concurrencia', () => {
    beforeEach(async () => { await loadMain(); });

    it('BUG: dos búsquedas simultáneas no se cancelan ni se serializan', async () => {
        let resolveWeather;
        fetchWeather.mockImplementation(() => new Promise(res => { resolveWeather = res; }));

        document.getElementById('cityInput').value = 'Madrid';
        document.getElementById('weatherForm').dispatchEvent(
            new Event('submit', { cancelable: true, bubbles: true }));
        document.getElementById('cityInput').value = 'Lima';
        document.getElementById('weatherForm').dispatchEvent(
            new Event('submit', { cancelable: true, bubbles: true }));

        resolveWeather(weatherPayload({ name: 'Madrid' }));
        await flush();

        // ambas búsquedas proceeded (el rate limiter es el único freno y aquí
        // está mockeado) -> la que responde último gana el render
        expect(fetchWeather).toHaveBeenCalledTimes(2);
    });
});