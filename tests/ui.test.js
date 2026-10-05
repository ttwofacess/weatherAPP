import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWeatherCard, renderForecast, initDonateModal, showAppNotice, hideAppNotice } from '../js/ui.js';
import { mountAppDom, weatherPayload, forecastPayload } from './helpers/fixtures.js';

beforeEach(() => {
    mountAppDom();
    localStorage.setItem('weatherapp_lang', 'es');
});

describe('renderWeatherCard', () => {
    it('escribe el nombre de la ciudad', () => {
        renderWeatherCard(weatherPayload());
        expect(document.getElementById('cityName').textContent).toBe('Madrid');
    });

    it('formatea la temperatura con un decimal', () => {
        renderWeatherCard(weatherPayload());
        expect(document.getElementById('temperature').textContent).toBe('21.4');
    });

    it('escribe la descripción', () => {
        renderWeatherCard(weatherPayload());
        expect(document.getElementById('description').textContent).toBe('cielo claro');
    });

    it('añade la unidad m/s al viento', () => {
        renderWeatherCard(weatherPayload());
        expect(document.getElementById('wind').textContent).toBe('2.6 m/s');
    });

    it('escribe la humedad como string', () => {
        renderWeatherCard(weatherPayload());
        expect(document.getElementById('humidity').textContent).toBe('45');
    });

    it('muestra la tarjeta y oculta el welcome', () => {
        renderWeatherCard(weatherPayload());
        expect(document.getElementById('weatherResult').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('welcomeContainer').classList.contains('hidden')).toBe(true);
    });

    it('sin doble encoding: un "&" en el nombre se muestra tal cual', () => {
        // renderWeatherCard asigna a textContent, que ya escapa por su cuenta.
        // Pasarlo por sanitizeHTML antes codificaba el "&" y el usuario veía
        // "Smith &amp; Sons". Ahora se ve "Smith & Sons".
        renderWeatherCard(weatherPayload({ name: 'Smith & Sons' }));
        expect(document.getElementById('cityName').textContent).toBe('Smith & Sons');
    });

    it('sin doble encoding: apóstrofos se muestran tal cual (St. John\'s)', () => {
        renderWeatherCard(weatherPayload({ name: "St. John's" }));
        expect(document.getElementById('cityName').textContent).toBe("St. John's");
    });

    it('sin doble encoding: acentos y eñes intactos', () => {
        renderWeatherCard(weatherPayload({ name: "L'Haÿ-les-Roses & Co" }));
        expect(document.getElementById('cityName').textContent).toBe("L'Haÿ-les-Roses & Co");
    });

    it('sigue siendo seguro: "<b>" se ve como texto, no se inyecta HTML', () => {
        renderWeatherCard(weatherPayload({ name: 'A <b>B</b> & C' }));
        const el = document.getElementById('cityName');
        expect(el.querySelector('b')).toBeNull();
        expect(el.textContent).toBe('A <b>B</b> & C');
    });

    it('sigue siendo seguro: un <img onerror> no crea nodos', () => {
        renderWeatherCard(weatherPayload({ name: '<img src=x onerror=alert(1)>' }));
        const el = document.getElementById('cityName');
        expect(el.querySelector('img')).toBeNull();
        expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('BUG: la tarjeta anterior NO se limpia — tras dos búsquedas quedan restos', () => {
        renderWeatherCard(weatherPayload());
        renderWeatherCard(weatherPayload({ name: 'Lima', main: { temp: 5.0, humidity: 80 } }));
        const el = document.getElementById('cityName');
        expect(el.textContent).toBe('Lima');
        // los campos que el 2º payload no toca quedan con el valor anterior
        expect(document.getElementById('humidity').textContent).toBe('80');
    });

    it('BUG: si data.main.temp llega como string, toFixed lanza', () => {
        const bad = weatherPayload();
        bad.main.temp = '21.37'; // así llega si la API cambia de tipo
        expect(() => renderWeatherCard(bad)).toThrow();
    });

    it('BUG: si data.weather viene vacío, revienta con TypeError', () => {
        const bad = weatherPayload();
        bad.weather = [];
        expect(() => renderWeatherCard(bad)).toThrow();
    });
});

describe('renderForecast', () => {
    // dt = 2026-01-15T12:00:00Z, city.timezone = +2h  => 14:00 local
    const DT = Date.UTC(2026, 0, 15, 12, 0, 0) / 1000;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(Date.UTC(2026, 0, 15, 0, 0, 0)));
    });

    afterEach(() => vi.useRealTimers());

    it('renderiza un item por intervalo', () => {
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 20 }, weather: [{ description: 'a', icon: '01d' }] },
            { dt: DT + 3600, main: { temp: 21 }, weather: [{ description: 'b', icon: '02d' }] },
        ]));
        expect(document.querySelectorAll('.forecast-item')).toHaveLength(2);
    });

    it('muestra la hora local de la ciudad (dt + timezone)', () => {
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 20 }, weather: [{ description: 'a', icon: '01d' }] },
        ]));
        expect(document.querySelector('.forecast-time').textContent).toContain('14:00');
    });

    it('aplica el offset negativo del oeste correctamente', () => {
        renderForecast(forecastPayload(
            [{ dt: DT, main: { temp: 20 }, weather: [{ description: 'a', icon: '01d' }] }],
            { city: { name: 'Lima', timezone: -18000 } }
        ));
        // 12:00Z - 5h = 07:00
        expect(document.querySelector('.forecast-time').textContent).toContain('07:00');
    });

    it('incluye el día de la semana', () => {
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 20 }, weather: [{ description: 'a', icon: '01d' }] },
        ]));
        // 2026-01-15 es jueves -> "jue" en es-ES
        expect(document.querySelector('.forecast-time').textContent).toContain('jue');
    });

    it('CARACTERIZACION: cruza medianoche local y el día sigue siendo coherente', () => {
        // dt = 2026-01-16 02:00Z, timezone -05:30 => 2026-01-15 20:30 local.
        // renderForecast descarta los minutos (getUTCHours), así que pinta 20:00.
        const lateLocal = Date.UTC(2026, 0, 16, 2, 0, 0) / 1000;
        renderForecast(forecastPayload(
            [{ dt: lateLocal, main: { temp: 20 }, weather: [{ description: 'a', icon: '01d' }] }],
            { city: { name: 'X', timezone: -19800 } }
        ));
        const time = document.querySelector('.forecast-time').textContent;
        expect(time).toContain('20:00');
        expect(time).toContain('jue'); // jueves 15 (día local), no viernes 16 (día UTC)
    });

    it('BUG: getUTCHours() descarta los minutos — cualquierforecast no alineado a la hora se muestra mal', () => {
        const dt = Date.UTC(2026, 0, 15, 12, 45, 0) / 1000;
        renderForecast(forecastPayload(
            [{ dt, main: { temp: 20 }, weather: [{ description: 'a', icon: '01d' }] }]
        ));
        // la hora real local es 14:45, pero se muestra 14:00
        expect(document.querySelector('.forecast-time').textContent).toContain('14:00');
    });

    it('renderiza la temperatura con un decimal y el grado', () => {
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 20.55 }, weather: [{ description: 'a', icon: '01d' }] },
        ]));
        expect(document.querySelector('.forecast-temp').textContent).toBe('20.6°C');
    });

    it('construye la URL del icono con el código de OWM', () => {
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 20 }, weather: [{ description: 'lluvia', icon: '10d' }] },
        ]));
        const img = document.querySelector('.forecast-icon img');
        expect(img.getAttribute('src')).toBe('https://openweathermap.org/img/wn/10d.png');
    });

    it('escribe la descripción en el alt de la imagen', () => {
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 20 }, weather: [{ description: 'lluvia', icon: '10d' }] },
        ]));
        expect(document.querySelector('.forecast-icon img').getAttribute('alt')).toBe('lluvia');
    });

    it('BUG: la imagen sigue al CDN externo pese a haber leafle local', () => {
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 20 }, weather: [{ description: 'a', icon: '01d' }] },
        ]));
        const src = document.querySelector('.forecast-icon img').getAttribute('src');
        expect(src).toContain('openweathermap.org');
    });

    it('BUG: limita a 16 items aunque la API devuelva 40', () => {
        const list = Array.from({ length: 40 }, (_, i) => ({
            dt: DT + i * 3600,
            main: { temp: 20 },
            weather: [{ description: 'a', icon: '01d' }],
        }));
        renderForecast(forecastPayload(list));
        expect(document.querySelectorAll('.forecast-item')).toHaveLength(16);
    });

    it('limpia el contenido anterior en cada render', () => {
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 20 }, weather: [{ description: 'a', icon: '01d' }] },
        ]));
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 21 }, weather: [{ description: 'b', icon: '02d' }] },
        ]));
        expect(document.querySelectorAll('.forecast-item')).toHaveLength(1);
    });

    it('muestra el contenedor', () => {
        renderForecast(forecastPayload([]));
        expect(document.getElementById('forecast').classList.contains('hidden')).toBe(false);
    });

    it('BUG: lanza si falta #forecast (sin guarda, a diferencia de renderWeatherCard)', () => {
        document.getElementById('forecast').remove();
        expect(() => renderForecast(forecastPayload([]))).toThrow();
    });

    it('BUG: no valida el shape del payload — list undefined revienta', () => {
        expect(() => renderForecast({ cod: '200' })).toThrow();
    });

    it('XSS CERRADO: sanitizeHTML escapa comillas dobles → ya no se inyectan atributos', () => {
        // El `icon` (o el `description`) viene de la respuesta de OWM y se
        // interpola dentro de src="..." / alt="...". Antes de este fix:
        //   <img src="...wn/x" onerror="alert(1).png" alt="a">
        const malicious = 'x" onerror="alert(1)';
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 20 }, weather: [{ description: 'a', icon: malicious }] },
        ]));
        const img = document.querySelector('.forecast-icon img');
        expect(img.hasAttribute('onerror')).toBe(false);
        // la comilla queda escapada y forma parte del valor del atributo,
        // junto con el sufijo .png de la plantilla
        expect(img.getAttribute('src'))
            .toBe('https://openweathermap.org/img/wn/x" onerror="alert(1).png');
    });

    it('XSS CERRADO: tampoco se inyecta onload desde la descripción', () => {
        renderForecast(forecastPayload([
            { dt: DT, main: { temp: 20 }, weather: [{ description: 'x" onload="alert(1)', icon: '01d' }] },
        ]));
        const img = document.querySelector('.forecast-icon img');
        expect(img.hasAttribute('onload')).toBe(false);
        expect(img.getAttribute('alt')).toBe('x" onload="alert(1)');
    });

    it('XSS CERRADO: no se inyecta nada desde un payload que rompa el elemento entero', () => {
        renderForecast(forecastPayload([
            {
                dt: DT, main: { temp: 20 },
                weather: [{ description: '"><img src=x onerror=alert(1)>', icon: '01d' }],
            },
        ]));
        // solo debe existir la img del icono, ninguna inyectada
        const imgs = document.querySelectorAll('.forecast-item img');
        expect(imgs).toHaveLength(1);
        imgs.forEach(i => {
            expect(i.hasAttribute('onerror')).toBe(false);
            expect(i.hasAttribute('onload')).toBe(false);
        });
    });
});

describe('showAppNotice / hideAppNotice', () => {
    it('escribe el mensaje y hace visible el aviso', () => {
        showAppNotice('No se pudo cargar la configuración');
        const el = document.getElementById('appNotice');
        expect(el.textContent).toBe('No se pudo cargar la configuración');
        expect(el.classList.contains('hidden')).toBe(false);
    });

    it('usa textContent, así que un payload no inyecta HTML', () => {
        showAppNotice('<img src=x onerror=alert(1)>');
        const el = document.getElementById('appNotice');
        expect(el.querySelector('img')).toBeNull();
        expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('sin doble encoding: el "&" se muestra literal', () => {
        showAppNotice('config & clima');
        expect(document.getElementById('appNotice').textContent).toBe('config & clima');
    });

    it('es idempotente: llamarlo dos veces no duplica texto', () => {
        showAppNotice('aviso');
        showAppNotice('aviso');
        const el = document.getElementById('appNotice');
        expect(el.textContent).toBe('aviso');
        expect(el.childNodes).toHaveLength(1);
    });

    it('reemplaza el mensaje anterior en vez de concatenar', () => {
        showAppNotice('primero');
        showAppNotice('segundo');
        expect(document.getElementById('appNotice').textContent).toBe('segundo');
    });

    it('hideAppNotice lo vuelve a ocultar', () => {
        showAppNotice('aviso');
        hideAppNotice();
        expect(document.getElementById('appNotice').classList.contains('hidden')).toBe(true);
    });

    it('hideAppNotice no borra el texto, solo lo oculta', () => {
        showAppNotice('aviso');
        hideAppNotice();
        expect(document.getElementById('appNotice').textContent).toBe('aviso');
    });

    it('no lanza si #appNotice no existe', () => {
        document.getElementById('appNotice').remove();
        expect(() => showAppNotice('x')).not.toThrow();
        expect(() => hideAppNotice()).not.toThrow();
    });

    it('arranca oculto tras mountAppDom', () => {
        expect(document.getElementById('appNotice').classList.contains('hidden')).toBe(true);
    });
});

describe('initDonateModal', () => {
    let writeText;

    beforeEach(() => {
        writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            writable: true, configurable: true, value: { writeText },
        });
    });

    it('abre el modal al pulsar el botón', () => {
        initDonateModal();
        document.getElementById('donateButton').click();
        expect(document.getElementById('donateModal').style.display).toBe('block');
    });

    it('cierra el modal con el botón de cerrar', () => {
        initDonateModal();
        const modal = document.getElementById('donateModal');
        modal.style.display = 'block';
        document.querySelector('.close-button').click();
        expect(modal.style.display).toBe('none');
    });

    it('cierra el modal al hacer click en el fondo', () => {
        initDonateModal();
        const modal = document.getElementById('donateModal');
        modal.style.display = 'block';
        modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(modal.style.display).toBe('none');
    });

    it('no cierra al hacer click dentro del contenido', () => {
        initDonateModal();
        const modal = document.getElementById('donateModal');
        modal.style.display = 'block';
        document.querySelector('.modal-content')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(modal.style.display).toBe('block');
    });

    it('copia la dirección al portapapeles', async () => {
        initDonateModal();
        document.querySelector('.copy-button').click();
        expect(writeText).toHaveBeenCalledWith('btc-addr');
    });

    it('muestra el check y restaura el icono tras 1500ms', async () => {
        vi.useFakeTimers();
        initDonateModal();
        const btn = document.querySelector('.copy-button');
        const original = btn.innerHTML;

        btn.click();
        await vi.advanceTimersByTimeAsync(0);
        expect(btn.innerHTML).toContain('fa-check');

        await vi.advanceTimersByTimeAsync(1500);
        expect(btn.innerHTML).toBe(original);
        vi.useRealTimers();
    });

    it('BUG: si falla el portapapeles, el error solo se loguea — el usuario no ve nada', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        writeText.mockRejectedValue(new Error('denied'));
        initDonateModal();
        document.querySelector('.copy-button').click();
        await Promise.resolve();
        await Promise.resolve();
        expect(err).toHaveBeenCalledWith('Failed to copy:', expect.any(Error));
        // el botón nunca cambia de estado: el usuario no recibe feedback
        expect(document.querySelector('.copy-button').innerHTML).toContain('fa-copy');
    });

    it('CARACTERIZACION: si falta algún elemento del modal, no hace nada', () => {
        document.getElementById('donateModal').remove();
        expect(() => initDonateModal()).not.toThrow();
    });

    it('BUG: initDonateModal() dos veces duplica el listener de cierre por fondo', () => {
        initDonateModal();
        initDonateModal();
        const modal = document.getElementById('donateModal');
        modal.style.display = 'block';
        modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        // el resultado es el mismo, pero el handler de window corre 2 veces por click
        expect(modal.style.display).toBe('none');
    });

    it('BUG: un .copy-button con data-copy inexistente no rompe, pero no avisa', () => {
        initDonateModal();
        const btn = document.querySelector('.copy-button');
        btn.setAttribute('data-copy', 'noExiste');
        expect(() => btn.click()).not.toThrow();
        expect(writeText).not.toHaveBeenCalled();
    });
});