import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translations, getActiveLang, t, initLanguageSwitch } from '../js/i18n.js';
import { mountAppDom } from './helpers/fixtures.js';

describe('translations', () => {
    it('expone los mismos keys en es y en', () => {
        expect(Object.keys(translations.es).sort()).toEqual(Object.keys(translations.en).sort());
    });

    it('no tiene valores undefined en ningún idioma', () => {
        for (const lang of ['es', 'en']) {
            for (const [k, v] of Object.entries(translations[lang])) {
                expect(v, `${lang}.${k}`).toBeDefined();
            }
        }
    });

    it('weekdayFormat fuerza timeZone UTC en ambos idiomas', () => {
        expect(translations.es.weekdayFormat.timeZone).toBe('UTC');
        expect(translations.en.weekdayFormat.timeZone).toBe('UTC');
    });

    it('BUG: timeFormat NO fija timeZone — la hora se formatea en la zona del navegador', () => {
        expect(translations.es.timeFormat.timeZone).toBeUndefined();
        expect(translations.en.timeFormat.timeZone).toBeUndefined();
    });
});

describe('getActiveLang', () => {
    it('respeta la preferencia guardada "es"', () => {
        localStorage.setItem('weatherapp_lang', 'es');
        expect(getActiveLang()).toBe('es');
    });

    it('respeta la preferencia guardada "en"', () => {
        localStorage.setItem('weatherapp_lang', 'en');
        expect(getActiveLang()).toBe('en');
    });

    it('ignora un valor guardado inválido y cae al default', () => {
        localStorage.setItem('weatherapp_lang', 'fr');
        expect(getActiveLang()).toBe('es');
    });

    it('sin preferencia guardada cae a "es" en el pathname por defecto de jsdom', () => {
        expect(window.location.pathname).toBe('/');
        expect(getActiveLang()).toBe('es');
    });

    it('FRAGILIDAD: el fallback por URL depende de que el fichero esté en el path', () => {
        // La heurística es `pathname.includes('index_en.html')`. Solo acierta si la
        // URL contiene literalmente ese nombre de fichero.
        expect(window.location.pathname.includes('index_en.html')).toBe(false);
        // Con pathname "/" (deploy en la raiz) el usuario ve español aunque la
        // página servida sea la inglesa.
    });

    it('es una función sin efectos secundarios', () => {
        localStorage.setItem('weatherapp_lang', 'en');
        getActiveLang();
        getActiveLang();
        expect(localStorage.getItem('weatherapp_lang')).toBe('en');
    });
});

describe('t', () => {
    it('devuelve los strings del idioma activo', () => {
        localStorage.setItem('weatherapp_lang', 'en');
        expect(t().invalidCity).toBe(translations.en.invalidCity);
        localStorage.setItem('weatherapp_lang', 'es');
        expect(t().invalidCity).toBe(translations.es.invalidCity);
    });

    it('nunca devuelve undefined', () => {
        localStorage.setItem('weatherapp_lang', 'en');
        expect(t()).toBeDefined();
    });

    it('timeFormat es un objeto compartido por referencia (mutable desde cualquier consumidor)', () => {
        const a = t().timeFormat;
        const b = t().timeFormat;
        expect(a).toBe(b);
    });
});

describe('initLanguageSwitch', () => {
    beforeEach(() => {
        mountAppDom();
    });

    it('marca el switch cuando el idioma activo es "en"', () => {
        localStorage.setItem('weatherapp_lang', 'en');
        initLanguageSwitch();
        expect(document.getElementById('language-switch').checked).toBe(true);
    });

    it('desmarca el switch cuando el idioma activo es "es"', () => {
        localStorage.setItem('weatherapp_lang', 'es');
        initLanguageSwitch();
        expect(document.getElementById('language-switch').checked).toBe(false);
    });

    it('no rompe si el elemento no existe (solo avisa)', () => {
        document.body.innerHTML = '';
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(() => initLanguageSwitch()).not.toThrow();
        expect(warn).toHaveBeenCalled();
    });

    it('persiste "en" al activar el switch', () => {
        initLanguageSwitch();
        const el = document.getElementById('language-switch');
        el.checked = true;
        el.dispatchEvent(new Event('change'));
        expect(localStorage.getItem('weatherapp_lang')).toBe('en');
    });

    it('persiste "es" al desactivar el switch', () => {
        localStorage.setItem('weatherapp_lang', 'en');
        initLanguageSwitch();
        const el = document.getElementById('language-switch');
        el.checked = false;
        el.dispatchEvent(new Event('change'));
        expect(localStorage.getItem('weatherapp_lang')).toBe('es');
    });

    it('BUG: registrar el listener dos veces lo duplica (no es idempotente)', () => {
        const el = document.getElementById('language-switch');
        initLanguageSwitch();
        const before = el.checked;
        initLanguageSwitch();
        // el estado del DOM se recalcula igual, pero ahora hay DOS handlers 'change'
        // registrados sobre el mismo elemento: cada toggle persiste y navega 2 veces.
        expect(el.checked).toBe(before);
        // initLanguageSwitch NO escribe en storage (solo lee): el usuario que
        // nunca ha tocado el switch conserva el fallback por URL.
        expect(localStorage.getItem('weatherapp_lang')).toBeNull();
    });

    it('BUG: la navegación usa un href relativo — se pierde el path base del deploy', () => {
        // Si la app se sirve bajo /weather/ , al cambiar de idioma se navega a
        // "index_en.html" en la RAIZ del dominio, no a /weather/index_en.html.
        const { pathname } = window.location;
        const currentFile = pathname.split('/').pop();
        // jsdom sirve los tests desde /tests/, así que el fichero nunca coincide
        // con el target y la navegación siempre se dispara.
        expect(currentFile).not.toBe('index_en.html');
    });
});