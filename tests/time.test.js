import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCityTime, formatTime, updateCityTime, startClock } from '../js/time.js';
import { mountAppDom } from './helpers/fixtures.js';

const ORIGINAL_TZ = process.env.TZ || 'UTC';

/** Fija la zona horaria del "navegador" para el test en curso. */
function setBrowserTz(tz) {
    process.env.TZ = tz;
}

/** Instante fijo: 2026-01-15 12:00:00 UTC. */
const T = Date.UTC(2026, 0, 15, 12, 0, 0);
const CITY_OFFSET_2H = 7200;      // UTC+02:00
const EXPECTED_14_00 = '14:00';

afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
});

describe('getCityTime', () => {
    afterEach(() => setBrowserTz(ORIGINAL_TZ));

    it('devuelve la hora de la ciudad cuando el navegador está en UTC', () => {
        setBrowserTz('UTC');
        vi.useFakeTimers();
        vi.setSystemTime(T);
        const d = getCityTime(CITY_OFFSET_2H);
        const expected = new Date(T + CITY_OFFSET_2H * 1000);
        expect(d.getTime()).toBe(expected.getTime());
        vi.useRealTimers();
    });

    it.each([
        ['UTC', '14:00'],
        ['Europe/Madrid', '14:00'],
        ['America/New_York', '14:00'],
        ['Asia/Tokyo', '14:00'],
        ['Australia/Sydney', '14:00'],
        ['Pacific/Kiritimati', '14:00'],
    ])('CARACTERIZACION: muestra 14:00 con offset +02h desde cualquier zona del navegador (%s)', (tz, expected) => {
        setBrowserTz(tz);
        vi.useFakeTimers();
        vi.setSystemTime(T);
        const d = getCityTime(CITY_OFFSET_2H);
        expect(d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })).toBe(expected);
        vi.useRealTimers();
    });

    it('BUG LATENTE: el resultado es correcto solo por cancelacion de dos errores', () => {
        // La funcion resta el offset del NAVEGADOR y despues formatTime suma el offset
        // del NAVEGADOR al renderizar. Los dos errores se anulan, asi que el resultado
        // visible es correcto, pero el Date devuelto NO representa la hora de la ciudad:
        // esta desplazado -offsetNavegador respecto a la hora local de la ciudad.
        setBrowserTz('Asia/Tokyo'); // UTC+09:00 => getTimezoneOffset() = -540
        vi.useFakeTimers();
        vi.setSystemTime(T);
        const d = getCityTime(0); // ciudad en UTC
        const truth = new Date(T); // 12:00 UTC
        expect(d.getTime()).toBe(truth.getTime() - 540 * 60000); // 9h por detrás (Tokyo = UTC+9)
        expect(d.getTime()).not.toBe(truth.getTime());
        vi.useRealTimers();
    });

    it.each([
        [-43200, '00:00'],
        [-18000, '07:00'],
        [0, '12:00'],
        [19800, '17:30'],
        [50400, '02:00'],
    ])('soporta offsets de ciudad extremos (%i)', (offset, expected) => {
        setBrowserTz('UTC');
        vi.useFakeTimers();
        vi.setSystemTime(T);
        const d = getCityTime(offset);
        expect(d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })).toBe(expected);
        vi.useRealTimers();
    });

    it.each([
        ['verano', Date.UTC(2026, 6, 1, 12, 0, 0)],
        ['invierno', Date.UTC(2026, 0, 15, 12, 0, 0)],
    ])('aguanta el cambio de horario de verano/invierno (%s)', (_label, ts) => {
        setBrowserTz('Europe/Madrid');
        vi.useFakeTimers();
        vi.setSystemTime(ts);
        const d = getCityTime(0);
        expect(d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })).toBe('12:00');
        vi.useRealTimers();
    });
});

describe('formatTime', () => {
    beforeEach(() => {
        localStorage.setItem('weatherapp_lang', 'es');
    });

    it('formatea en el locale activo (es-ES → 24h)', () => {
        setBrowserTz('UTC');
        vi.useFakeTimers();
        vi.setSystemTime(T);
        expect(formatTime(new Date(T))).toBe('12:00');
        vi.useRealTimers();
    });

    it('BUG: en-US usa 12h, la misma hora se ve distinta entre idiomas', () => {
        setBrowserTz('UTC');
        vi.useFakeTimers();
        vi.setSystemTime(T);
        localStorage.setItem('weatherapp_lang', 'es');
        const es = formatTime(new Date(Date.UTC(2026, 0, 15, 14, 0, 0)));
        localStorage.setItem('weatherapp_lang', 'en');
        const en = formatTime(new Date(Date.UTC(2026, 0, 15, 14, 0, 0)));
        expect(es).toBe('14:00');
        expect(en).toBe('02:00 PM');
        vi.useRealTimers();
    });

    it('BUG CONFIRMADO: formatea en la zona del NAVEGADOR, no en la de la ciudad', () => {
        // formatTime es API pública y no recibe zona: ignora la ciudad por completo.
        setBrowserTz('Asia/Tokyo'); // UTC+09:00
        localStorage.setItem('weatherapp_lang', 'es');
        expect(formatTime(new Date(Date.UTC(2026, 0, 15, 12, 0, 0)))).toBe('21:00');
    });
});

describe('updateCityTime', () => {
    beforeEach(() => {
        mountAppDom();
        localStorage.setItem('weatherapp_lang', 'es');
        setBrowserTz('UTC');
        vi.useFakeTimers();
        vi.setSystemTime(T);
    });

    afterEach(() => vi.useRealTimers());

    it('escribe la hora formateada en #currentTime', () => {
        updateCityTime(CITY_OFFSET_2H);
        expect(document.getElementById('currentTime').textContent).toBe(EXPECTED_14_00);
    });

    it('guarda el offset en data-timezone-offset', () => {
        updateCityTime(CITY_OFFSET_2H);
        expect(document.getElementById('currentTime').dataset.timezoneOffset).toBe('7200');
    });

    it('es idempotente', () => {
        updateCityTime(CITY_OFFSET_2H);
        updateCityTime(CITY_OFFSET_2H);
        expect(document.getElementById('currentTime').textContent).toBe(EXPECTED_14_00);
    });

    it('no lanza si #currentTime no existe', () => {
        document.getElementById('currentTime').remove();
        expect(() => updateCityTime(CITY_OFFSET_2H)).not.toThrow();
    });

    it('BUG: un offset no numérico (NaN) se escribe y luego rompe el reloj', () => {
        updateCityTime('abc');
        const el = document.getElementById('currentTime');
        expect(el.dataset.timezoneOffset).toBe('abc');
        expect(el.textContent).toBe('Invalid Date');
    });
});

describe('startClock', () => {
    beforeEach(() => {
        mountAppDom();
        localStorage.setItem('weatherapp_lang', 'es');
        setBrowserTz('UTC');
        vi.useFakeTimers();
        vi.setSystemTime(T);
    });

    afterEach(() => vi.useRealTimers());

    it('devuelve el id del intervalo', () => {
        const id = startClock();
        expect(id).toBeDefined();
        clearInterval(id);
    });

    it('actualiza #currentTime cada 60s', () => {
        const el = document.getElementById('currentTime');
        el.dataset.timezoneOffset = String(CITY_OFFSET_2H);
        document.getElementById('weatherResult').classList.remove('hidden');

        // Nos colocamos 60s antes del instante objetivo para que, tras avanzar
        // el reloj 60s, "now" coincida exactamente con T.
        vi.setSystemTime(T - 60_000);
        const id = startClock();
        vi.advanceTimersByTime(60_000);

        expect(el.textContent).toBe(EXPECTED_14_00);
        clearInterval(id);
    });

    it('BUG: no actualiza si la tarjeta está oculta', () => {
        const el = document.getElementById('currentTime');
        el.dataset.timezoneOffset = String(CITY_OFFSET_2H);
        el.textContent = 'SENTINEL';
        document.getElementById('weatherResult').classList.add('hidden');

        const id = startClock();
        vi.advanceTimersByTime(180_000);
        expect(el.textContent).toBe('SENTINEL');
        clearInterval(id);
    });

    it('no lanza si falta #currentTime o #weatherResult', () => {
        const id = startClock();
        document.getElementById('weatherResult').remove();
        expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
        clearInterval(id);
    });

    it('BUG: si data-timezone-offset falta, el reloj no hace nada en silencio', () => {
        const el = document.getElementById('currentTime');
        el.textContent = 'SIN OFFSET';
        document.getElementById('weatherResult').classList.remove('hidden');

        const id = startClock();
        vi.advanceTimersByTime(60_000);
        expect(el.textContent).toBe('SIN OFFSET');
        clearInterval(id);
    });

    it('BUG: si data-timezone-offset es un string no numérico, se muestra "Invalid Date"', () => {
        const el = document.getElementById('currentTime');
        el.dataset.timezoneOffset = 'no-numero';
        document.getElementById('weatherResult').classList.remove('hidden');

        const id = startClock();
        vi.advanceTimersByTime(60_000);
        expect(el.textContent).toBe('Invalid Date');
        clearInterval(id);
    });

    it('BUG: varios startClock() crean intervalos fantasma que no se limpian', () => {
        const el = document.getElementById('currentTime');
        el.dataset.timezoneOffset = String(CITY_OFFSET_2H);
        document.getElementById('weatherResult').classList.remove('hidden');

        vi.setSystemTime(T - 60_000);
        const ids = [startClock(), startClock(), startClock()];
        vi.advanceTimersByTime(60_000);
        ids.forEach(clearInterval);

        // el texto es correcto, pero el intervalo se dispara 3 veces por tick
        expect(el.textContent).toBe(EXPECTED_14_00);
    });
});