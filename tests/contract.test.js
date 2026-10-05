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
    'appNotice',
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

    it('el input de ciudad no lleva pattern: la validación es de OWM', () => {
        expect(html).not.toContain('pattern=');
        expect(html).not.toContain('Solo se permiten');
        expect(html).not.toContain('Only letters');
    });

    it('el input de ciudad conserva required', () => {
        expect(html).toMatch(/id="cityInput"[\s\S]{0,200}required/);
    });

    it('el input no lleva maxlength, para no recortar nombres largos', () => {
        expect(html).not.toContain('maxlength');
    });

    it('el aviso existe, es un landmark accesible y arranca oculto', () => {
    expect(html).toMatch(/id="appNotice"[^>]*role="alert"/);
    expect(html).toMatch(/id="appNotice"[^>]*class="app-notice hidden"/);
});

it('el CSS del aviso está importado en main.css', () => {
    expect(read('css/main.css')).toContain("components/notice.css");
});

it('el aviso usa el token de color definido en base.css', () => {
    expect(read('css/components/notice.css')).toContain('var(--danger)');
    expect(read('css/components/base.css')).toContain('--danger:');
});

it('la URL de la API key se pide a /api/config (ruta de la Pages Function)', () => {
        expect(read('js/api.js')).toContain("'/api/config'");
    });
});

describe('main.js — sin validación client-side de la ciudad', () => {
    it('no filtra caracteres antes de llamar a la API', () => {
        // Si alguien reintroduce un regex, el contrato entre el HTML y el JS
        // vuelve a depender de mantener ambos sincronizados, que es exactamente
        // lo que rompió antes (el pattern del HTML era más restrictivo).
        const src = read('js/main.js');
        expect(src).not.toMatch(/cityInput\s*\)\s*\|\|/);
        expect(src).toMatch(/if \(!cityInput\)/);
    });

    it('la URL se construye con encodeURIComponent sobre lo que sea', () => {
        expect(read('js/api.js')).toContain('encodeURIComponent(city)');
    });
});

describe('Leaflet vendorizado — supuesto del popup', () => {
    it('asigna strings con innerHTML y nodos con appendChild', () => {
        // Toda la seguridad del popup depende de este comportamiento: si una
        // actualización de Leaflet hiciera innerHTML con cualquier contenido,
        // pasar el nombre como nodo dejaría de proteger frente a XSS.
        const src = read('assets/leaflet/leaflet.js');
        const m = src.match(/_updateContent:function\(\)\{(?:(?!},[a-zA-Z_$]+\:function).){0,700}/s);

        expect(m, 'no se encontró _updateContent en leaflet.js').not.toBeNull();
        expect(m[0]).toMatch(/"string"==typeof\s*\w+\)\s*\w+\.innerHTML/);
        expect(m[0]).toMatch(/appendChild/);
    });

    it('la versión vendorizada es la esperada', () => {
        expect(read('assets/leaflet/leaflet.js')).toMatch(/version:"[\d.]+"/);
    });
});

describe('main.js — normalización de cod', () => {
    it('ambos endpoints pasan por isOkCod, no por literales', () => {
        const src = read('js/main.js');
        expect(src).toContain('function isOkCod');
        expect(src).toContain('if (!isOkCod(weatherData.cod))');
        expect(src).toContain('if (!isOkCod(forecastData.cod))');
        // reintroducir una comparación estricta contra un literal rompe esto
        expect(src).not.toMatch(/\.cod\s*!==/);
        expect(src).not.toMatch(/\.cod\s*===/);
    });

    it('isOkCod normaliza con Number, que tolera string y número', () => {
        expect(read('js/main.js')).toMatch(/Number\(cod\)\s*===\s*200/);
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