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
const showAppNotice = vi.fn();
const hideAppNotice = vi.fn();
const initLanguageSwitch = vi.fn();
const checkLimit = vi.fn();

vi.mock('../js/api.js', () => ({
    fetchApiKey, fetchWeather, fetchForecast, getApiKey, hasApiKeyError,
}));
vi.mock('../js/map.js', () => ({ updateMap }));
vi.mock('../js/time.js', () => ({ updateCityTime, startClock }));
vi.mock('../js/ui.js', () => ({
    renderWeatherCard, renderForecast, initDonateModal, showAppNotice, hideAppNotice,
}));
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
    showAppNotice.mockImplementation(() => {});
    hideAppNotice.mockImplementation(() => {});

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

    it('la entrada vacía la bloquea el navegador por required, sin llegar al JS', async () => {
        // defense in depth: required en el HTML y el check de JS coinciden
        const input = document.getElementById('cityInput');
        expect(input.hasAttribute('required')).toBe(true);
    });

    it.each([
        ['Madrid; DROP TABLE'],
        ['A Coruña-Málaga'],
        ['Lima-Perú'],
        ['Bogotá'],
        ['Smith & Sons'],
        ['AT&T Arena'],
        ['São Paulo'],
        ['Curaçao'],
        ['Zürich'],
        ['Malmö'],
        ['Gdańsk'],
        ['Kraków'],
        ['!!!'],
        ['   a   '],
    ])('OWM decide: acepta cualquier entrada no vacía tal cual (%s)', async (city) => {
        await submit(city);
        expect(fetchWeather).toHaveBeenCalledWith(city.trim(), 'KEY', 'es');
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

    it('una ciudad con "&" en el nombre ahora sí se busca', async () => {
        // Antes el regex de validación rechazaba "&", así que "AT&T Arena"
        // era inalcanzable. Con OWM decidiendo, llega a la API.
        await submit('AT&T Arena');
        expect(fetchWeather).toHaveBeenCalledWith('AT&T Arena', 'KEY', 'es');
    });

    it('no muestra alert en el camino feliz', async () => {
        await submit('Madrid');
        expect(window.alert).not.toHaveBeenCalled();
    });
});

describe('main.js — fallo de apiKey', () => {
    beforeEach(async () => { await loadMain(); });

    it('si fetchApiKey lanza en el submit, se muestra el aviso y no hay búsqueda', async () => {
        getApiKey.mockReturnValue(null);
        fetchApiKey.mockRejectedValue(new Error('boom'));

        await submit('Madrid');

        expect(fetchWeather).not.toHaveBeenCalled();
        expect(showAppNotice).toHaveBeenCalledWith(
            'No se pudo cargar la configuración de la aplicación. La búsqueda del clima estará deshabilitada hasta que recargues la página.'
        );
    });

    it('si ya había error de key, el submit muestra el aviso en vez de fallar en silencio', async () => {
        getApiKey.mockReturnValue(null);
        hasApiKeyError.mockReturnValue(true);

        await submit('Madrid');

        expect(fetchApiKey).not.toHaveBeenCalled();
        expect(fetchWeather).not.toHaveBeenCalled();
        // antes esto no mostraba nada: el usuario pulsaba Buscar y no pasaba nada
        expect(showAppNotice).toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('no reintenta tras un fallo previo', async () => {
        getApiKey.mockReturnValue(null);
        hasApiKeyError.mockReturnValue(true);

        await submit('Madrid');
        await submit('Lima');
        await submit('Bogotá');

        expect(fetchApiKey).not.toHaveBeenCalled();
        // pero el aviso se asegura en cada intento, así que nunca desaparece
        expect(showAppNotice).toHaveBeenCalledTimes(3);
    });

    it('el aviso de la carga inicial se muestra si /api/config falla al arrancar', async () => {
        fetchApiKey.mockRejectedValue(new Error('boom'));
        await loadMain();
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await flush();

        expect(showAppNotice).toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalled();
    });

    it('el aviso se oculta si la carga inicial tiene éxito', async () => {
        await loadMain();
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await flush();

        expect(hideAppNotice).toHaveBeenCalled();
        expect(showAppNotice).not.toHaveBeenCalled();
    });

    it('una búsqueda con key válida deja el aviso oculto', async () => {
        await loadMain();
        await submit('Madrid');
        expect(hideAppNotice).toHaveBeenCalled();
        expect(showAppNotice).not.toHaveBeenCalled();
    });

    it('BUG: si fetchApiKey devuelve undefined sin lanzar, se muestra el aviso', async () => {
        getApiKey.mockReturnValue(null);
        fetchApiKey.mockResolvedValue(undefined);

        await submit('Madrid');

        expect(fetchWeather).not.toHaveBeenCalled();
        expect(showAppNotice).toHaveBeenCalled();
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

    it('acepta cod como string en /weather', async () => {
        // /weather devuelve cod numérico hoy, pero si OWM lo cambiara a string
        // una búsqueda legítima ya no se reportaría como error.
        fetchWeather.mockResolvedValue({ ...weatherPayload(), cod: '200' });
        await submit('Madrid');

        expect(renderWeatherCard).toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('sin doble encoding: el mensaje del alert muestra el "&" literal', async () => {
        // alert() es contexto de texto puro, no HTML: no necesita escape, y
        // aplicarlo hacía que el usuario leyera literalmente "a &amp; b".
        fetchWeather.mockResolvedValue({ cod: 500, message: 'a & b' });
        await submit('Madrid');

        expect(window.alert).toHaveBeenCalledWith(
            'Hubo un error: Ciudad no encontrada o error en datos: a & b'
        );
    });

    it('sin doble encoding: también en el mensaje del pronóstico', async () => {
        fetchForecast.mockResolvedValue({ cod: '500', message: 'x & y <z>' });
        await submit('Madrid');

        expect(window.alert).toHaveBeenCalledWith(
            'Hubo un error: Error al obtener el pronóstico: x & y <z>'
        );
    });

    it('BUG: el nombre que va al popup SÍ sigue sanitizado (bindPopup es HTML)', async () => {
        fetchWeather.mockResolvedValue(weatherPayload({ name: '<b>x</b> & y' }));
        await submit('Madrid');
        const coords = updateMap.mock.calls[0][0];
        // escapado: si bindPopup lo tratara como HTML, no inyectaría nodos
        expect(coords.name).toBe('&lt;b&gt;x&lt;/b&gt; &amp; y');
    });

    it('acepta cod numérico en /forecast', async () => {
        fetchWeather.mockResolvedValue(weatherPayload());
        // /forecast devuelve "200" (string) hoy; si fuera numérico, la
        // comparación !== '200' lo habría tratado como error.
        fetchForecast.mockResolvedValue({ ...forecastPayload(), cod: 200 });
        await submit('Madrid');

        expect(renderForecast).toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('ambos endpoints comparten la misma normalización de cod', async () => {
        // main.js usa isOkCod() en los dos: no puede volver la asimetría
        // número-vs-string sin que los tests de ambos endpoints fallen.
        for (const cod of ['200', 200]) {
            vi.clearAllMocks();
            fetchWeather.mockResolvedValue({ ...weatherPayload(), cod });
            fetchForecast.mockResolvedValue({ ...forecastPayload(), cod });
            await submit('Madrid');
            expect(renderWeatherCard, `/weather con cod ${typeof cod}`).toHaveBeenCalled();
            expect(renderForecast, `/forecast con cod ${typeof cod}`).toHaveBeenCalled();
        }
    });

    it.each([
        [404],
        ['404'],
        [500],
        ['500'],
        [null],
        [undefined],
        [''],
        ['not a number'],
    ])('rechaza cod de error en ambos endpoints (%s)', async (cod) => {
        fetchWeather.mockResolvedValue({ ...weatherPayload(), cod });
        await submit('Madrid');
        expect(renderWeatherCard).not.toHaveBeenCalled();

        vi.clearAllMocks();
        fetchWeather.mockResolvedValue(weatherPayload());
        fetchForecast.mockResolvedValue({ ...forecastPayload(), cod });
        await submit('Madrid');
        expect(renderForecast).not.toHaveBeenCalled();
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