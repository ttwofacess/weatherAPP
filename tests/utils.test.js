import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeHTML, fetchWithTimeout, rateLimiter } from '../js/utils.js';

describe('sanitizeHTML', () => {
    it('neutraliza etiquetas HTML escapando el texto', () => {
        expect(sanitizeHTML('<script>alert(1)</script>'))
            .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapa < y > de un payload de atributo', () => {
        const out = sanitizeHTML('" onmouseover="alert(1)');
        expect(out).not.toContain('<');
    });

    it('preserva texto plano sin cambios', () => {
        expect(sanitizeHTML('Madrid')).toBe('Madrid');
    });

    it('escapa el & antes que nada (evita doble encoding de entidades)', () => {
        // & se procesa en la misma pasada, así que "&amp;" -> "&amp;amp;" es
        // lo correcto para una única pasada (no hay recursión).
        expect(sanitizeHTML('&lt;')).toBe('&amp;lt;');
    });

    it('ESCAPA comillas dobles — cierra la inyección de atributos', () => {
        expect(sanitizeHTML('x" onerror="alert(1)'))
            .toBe('x&quot; onerror=&quot;alert(1)');
    });

    it('ESCAPA comillas simples', () => {
        expect(sanitizeHTML("it's")).toBe('it&#39;s');
    });

    it('escapa todos los caracteres peligrosos de una vez', () => {
        expect(sanitizeHTML(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    });

    it('el resultado es seguro dentro de un atributo entrecomillado', () => {
        const el = document.createElement('div');
        el.innerHTML = `<img src="x${sanitizeHTML('" onerror="alert(1)')}" alt="a">`;
        const img = el.querySelector('img');
        expect(img.hasAttribute('onerror')).toBe(false);
        expect(img.getAttribute('src')).toBe('x" onerror="alert(1)');
    });

    it('el resultado es seguro dentro de un atributo con comillas simples', () => {
        const el = document.createElement('div');
        el.innerHTML = `<img alt='${sanitizeHTML("' onerror='alert(1)")}'>`;
        expect(el.querySelector('img').hasAttribute('onerror')).toBe(false);
    });

    it('el resultado es seguro como nodo de texto', () => {
        const el = document.createElement('div');
        el.innerHTML = sanitizeHTML('<script>alert(1)</script>');
        expect(el.querySelector('script')).toBeNull();
        expect(el.textContent).toBe('<script>alert(1)</script>');
    });

    it('devuelve cadena vacía para null/undefined', () => {
        expect(sanitizeHTML(null)).toBe('');
        expect(sanitizeHTML(undefined)).toBe('');
    });

    it('convierte tipos no string', () => {
        expect(sanitizeHTML(21.4)).toBe('21.4');
        expect(sanitizeHTML(0)).toBe('0');
    });

    it('ya no depende del DOM (el módulo se declara sin DOM)', () => {
        const spy = vi.spyOn(document, 'createElement');
        sanitizeHTML('<b>x</b>');
        expect(spy).not.toHaveBeenCalled();
    });

    it('ESCAPA & (bug): un solo paso de encoding, no es idempotente como doble-sanitización', () => {
        // sanitizeHTML es un encoder de una pasada.
        // Si un llamador lo aplica y luego asigna a textContent, el usuario ve "&amp;".
        expect(sanitizeHTML('a & b')).toBe('a &amp; b');
    });

    it('BUG CONFIRMADO: doble sanitización produce doble encoding', () => {
        const once = sanitizeHTML('Ciudad & Co');
        const twice = sanitizeHTML(once);
        expect(twice).toBe('Ciudad &amp;amp; Co');
    });

    it('no es idempotente', () => {
        const s = 'A & B <b>';
        expect(sanitizeHTML(sanitizeHTML(s))).not.toBe(sanitizeHTML(s));
    });
});

describe('fetchWithTimeout', () => {
    let fetchSpy;

    beforeEach(() => {
        fetchSpy = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('pasa la URL y las opciones restantes a fetch', async () => {
        await fetchWithTimeout('/api/config', { method: 'GET', timeout: 1234 });
        const [, opts] = fetchSpy.mock.calls[0];
        expect(opts.method).toBe('GET');
    });

    it('inyecta una signal de AbortController', async () => {
        await fetchWithTimeout('/x');
        const [, opts] = fetchSpy.mock.calls[0];
        expect(opts.signal).toBeInstanceOf(AbortSignal);
    });

    it('default timeout de 8000ms (fetch pendiente)', async () => {
        vi.useFakeTimers();
        fetchSpy.mockImplementation((_url, { signal }) => new Promise((_res, rej) => {
            signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        }));

        const p = fetchWithTimeout('/x');
        p.catch(() => {});

        await vi.advanceTimersByTimeAsync(7999);
        const [, opts] = fetchSpy.mock.calls[0];
        expect(opts.signal.aborted).toBe(false);

        await vi.advanceTimersByTimeAsync(2);
        expect(opts.signal.aborted).toBe(true);
    });

    it('respeta un timeout custom', async () => {
        vi.useFakeTimers();
        fetchSpy.mockImplementation((_url, { signal }) => new Promise((_res, rej) => {
            signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        }));

        const p = fetchWithTimeout('/x', { timeout: 500 });
        p.catch(() => {});

        await vi.advanceTimersByTimeAsync(501);
        const [, opts] = fetchSpy.mock.calls[0];
        expect(opts.signal.aborted).toBe(true);
    });

    it('BUG: el timer se limpia en cuanto fetch resuelve (correcto), pero abort no se traduce', async () => {
        vi.useFakeTimers();
        fetchSpy.mockImplementation((_url, { signal }) => new Promise((_res, rej) => {
            signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        }));

        const p = fetchWithTimeout('/x');
        const assertion = expect(p).rejects.toThrowError(/abort/i);
        await vi.advanceTimersByTimeAsync(9000);
        await assertion;
    });

    it('limpia el timer cuando la promesa resuelve', async () => {
        vi.useFakeTimers();
        const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
        await fetchWithTimeout('/x');
        expect(clearSpy).toHaveBeenCalled();
    });

    it('limpia el timer cuando la promesa rechaza', async () => {
        vi.useFakeTimers();
        fetchSpy.mockRejectedValue(new Error('network'));
        const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
        await expect(fetchWithTimeout('/x')).rejects.toThrow('network');
        expect(clearSpy).toHaveBeenCalled();
    });

    it('BUG: una signal pasada por el llamador se descarta silenciosamente', async () => {
        const own = new AbortController();
        await fetchWithTimeout('/x', { signal: own.signal });
        const [, opts] = fetchSpy.mock.calls[0];
        expect(opts.signal).not.toBe(own.signal);
    });

    it('propaga el valor de la respuesta', async () => {
        fetchSpy.mockResolvedValue({ ok: true, value: 42 });
        await expect(fetchWithTimeout('/x')).resolves.toEqual({ ok: true, value: 42 });
    });
});

describe('rateLimiter', () => {
    beforeEach(() => {
        rateLimiter.lastCall = 0;
        rateLimiter.minInterval = 2000;
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('permite la primera llamada (lastCall inicial en 0)', () => {
        expect(() => rateLimiter.checkLimit()).not.toThrow();
    });

    it('lanza RATE_LIMIT en llamadas consecutivas', () => {
        rateLimiter.checkLimit();
        expect(() => rateLimiter.checkLimit()).toThrow('RATE_LIMIT');
    });

    it('permite de nuevo tras pasar minInterval', () => {
        rateLimiter.checkLimit();
        vi.setSystemTime(Date.now() + 2000);
        expect(() => rateLimiter.checkLimit()).not.toThrow();
    });

    it('bloquea justo por debajo del intervalo', () => {
        rateLimiter.checkLimit();
        vi.setSystemTime(Date.now() + 1999);
        expect(() => rateLimiter.checkLimit()).toThrow('RATE_LIMIT');
    });

    it('BUG: estado global mutable — el limite se comparte entre consumidores', () => {
        rateLimiter.checkLimit();
        // Un segundo consumidor independiente suffers el mismo bloqueo
        expect(() => rateLimiter.checkLimit()).toThrow('RATE_LIMIT');
    });
});