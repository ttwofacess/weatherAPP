import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// tests/contract.test.js
// Contrato entre el HTML y el JS. Estos tests NO son "unitarios" en sentido estricto,
// pero protegen las uniones que ningún test unitario cubre: si alguien renombra un id
// en index.html, el JS sigue "funcionando" en los tests unitarios pero revienta en prod.

const ROOT = process.cwd();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const htmlFiles = ['index.html', 'index_en.html'];

/** ids que el JS busca imperativamente */
const REQUIRED_IDS = [
    'weatherForm',
    'cityInput',
    'language-switch',
    'welcomeContainer',
    'weatherResult',
    'cityName',
    'currentTime',
    'temperature',
    'description',
    'wind',
    'humidity',
    'map',
    'forecast',
    'donateButton',
    'donateModal',
    'btcAddress',
    'ltcAddress',
    'usdcAddress',
];

describe.each(htmlFiles)('%s — contrato con el JS', (file) => {
    let html;

    beforeEach(() => {
        html = read(file);
    });

    it.each(REQUIRED_IDS)('contiene el id #%s', (id) => {
        expect(html).toContain(`id="${id}"`);
    });

    it('carga main.js como módulo ES', () => {
        expect(html).toContain('<script type="module" src="js/main.js"></script>');
    });

    it('carga Leaflet localmente (sin CDN)', () => {
        expect(html).toContain('assets/leaflet/leaflet.js');
    });

    it('carga leaflet.css', () => {
        expect(html).toContain('assets/leaflet/leaflet.css');
    });

    it('define el lang correcto en <html>', () => {
        const expected = file === 'index_en.html' ? 'en' : 'es';
        expect(html).toMatch(new RegExp(`<html lang="${expected}">`));
    });

    it('no expone la API key en el HTML', () => {
        expect(html).not.toMatch(/appid=[a-f0-9]{32}/i);
        expect(html).not.toContain('OPENWEATHERMAP_API_KEY');
    });

    it('no incluye la API key en ningún script embebido', () => {
        const inlineScripts = html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g) ?? [];
        expect(inlineScripts).toHaveLength(0);
    });

    it('BUG CONFIRMADO: el pattern del input es más restrictivo que el regex del JS', () => {
        const pattern = html.match(/pattern="([^"]+)"/)?.[1];
        expect(pattern).toBe('[a-zA-Z\\s,]+');

        // main.js:30
        const jsRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s,-]+$/;
        const htmlRegex = new RegExp(`^${pattern}$`);

        // Ambas aceptan el caso simple:
        expect(jsRegex.test('Madrid')).toBe(true);
        expect(htmlRegex.test('Madrid')).toBe(true);

        // Pero DIVERGEN en ciudades con acentos o guiones: el navegador rechaza
        // el submit antes de que main.js pueda validar nada.
        for (const city of ['A Coruña', 'Lima-Perú', 'Bogotá']) {
            expect(jsRegex.test(city), `JS acepta "${city}"`).toBe(true);
            expect(htmlRegex.test(city), `HTML pattern rechaza "${city}"`).toBe(false);
        }
    });

    it('BUG CONFIRMADO: el regex del JS ni siquiera cubre todo el latín extendido', () => {
        // La clase es [a-zA-ZáéíóúÁÉÍÓÚñÑ] — faltan ã ñ(acute) î ç ö ü ø å æ …
        // Ciudades reales de OWM quedan inalcanzables.
        const jsRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s,-]+$/;

        const rechazadas = ['São Paulo', 'Gdańsk', 'Curaçao', 'Zürich', 'Malmö', 'Ålesund'];
        for (const city of rechazadas) {
            expect(jsRegex.test(city), `JS debería aceptar "${city}"`).toBe(false);
        }

        // las que sí caen en la clase actual (í, ó sí están):
        for (const city of ['Brasília', 'Vitória', 'Kraków', 'Bogotá', 'Málaga']) {
            expect(jsRegex.test(city), `JS debería aceptar "${city}"`).toBe(true);
        }
    });

    it('la URL de la API key se pide a /api/config (ruta de la Pages Function)', () => {
        expect(read('js/api.js')).toContain("'/api/config'");
    });
});

describe('functions/api/config.js — contrato', () => {
    it('expone onRequestGet', async () => {
        const mod = await import('../functions/api/config.js');
        expect(typeof mod.onRequestGet).toBe('function');
    });
});

describe('hooking de Cloudflare Pages', () => {
    it('la función vive en functions/api/config.js para servir /api/config', () => {
        expect(() => read('functions/api/config.js')).not.toThrow();
    });
});