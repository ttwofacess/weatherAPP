import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet } from '../functions/api/config.js';

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** Response está disponible como global en Node >= 18 */
const makeContext = (env) => ({ env });

describe('onRequestGet', () => {
    it('devuelve 200 con la apiKey cuando la env var existe', async () => {
        const res = await onRequestGet(makeContext({ OPENWEATHERMAP_API_KEY: 'KEY-123' }));

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ apiKey: 'KEY-123' });
    });

    it('establece Content-Type application/json', async () => {
        const res = await onRequestGet(makeContext({ OPENWEATHERMAP_API_KEY: 'K' }));
        expect(res.headers.get('Content-Type')).toBe('application/json');
    });

    it('devuelve 500 si falta la env var', async () => {
        const res = await onRequestGet(makeContext({}));

        expect(res.status).toBe(500);
        await expect(res.json()).resolves.toEqual({ error: 'Application configuration error.' });
    });

    it('devuelve 500 si la env var es una cadena vacía', async () => {
        const res = await onRequestGet(makeContext({ OPENWEATHERMAP_API_KEY: '' }));
        expect(res.status).toBe(500);
    });

    it('BUG: si context.env es undefined, lanza TypeError en vez de responder 500', async () => {
        await expect(onRequestGet({})).rejects.toThrow(TypeError);
    });

    it('BUG: loguea el error pero no distingue "sin configurar" de "fallo de plataforma"', async () => {
        await onRequestGet(makeContext({}));
        expect(console.error).toHaveBeenCalledWith(
            'OPENWEATHERMAP_API_KEY environment variable not set in Cloudflare Pages.'
        );
    });

    it('BUG: la respuesta 500 también lleva Content-Type json (correcto) pero sin no-store', async () => {
        const res = await onRequestGet(makeContext({}));
        // Sin Cache-Control, un CDN podría cachear el error 500 y la key nunca
        // llegaría al cliente aunque se configurara después.
        expect(res.headers.get('Cache-Control')).toBeNull();
    });

    it('BUG: la respuesta 200 tampoco marca la key como no-cacheable ni private', async () => {
        const res = await onRequestGet(makeContext({ OPENWEATHERMAP_API_KEY: 'K' }));
        expect(res.headers.get('Cache-Control')).toBeNull();
        expect(res.headers.get('Pragma')).toBeNull();
    });

    it('no filtra otros campos del env', async () => {
        const res = await onRequestGet(makeContext({
            OPENWEATHERMAP_API_KEY: 'K',
            SECRET_TOKEN: 'no-debe-salir',
        }));
        await expect(res.json()).resolves.toEqual({ apiKey: 'K' });
    });

    it('solo expone la key, no el resto de context', async () => {
        const res = await onRequestGet(makeContext({ OPENWEATHERMAP_API_KEY: 'K' }));
        const body = await res.json();
        expect(Object.keys(body)).toEqual(['apiKey']);
    });

    it('es determinista', async () => {
        const env = { OPENWEATHERMAP_API_KEY: 'K' };
        const a = await onRequestGet(makeContext(env));
        const b = await onRequestGet(makeContext(env));
        expect(a.status).toBe(b.status);
        expect(await a.json()).toEqual(await b.json());
    });

    it('BUG: el nombre onRequestGet sugiere que solo atiende GET, pero no rechaza otros verbos', async () => {
        // Cloudflare enruta por el nombre del handler, así que no es un bug de
        // Cloudflare, pero la función no tiene validación propia de método.
        const res = await onRequestGet(makeContext({ OPENWEATHERMAP_API_KEY: 'K' }), { method: 'POST' });
        expect(res.status).toBe(200);
    });
});