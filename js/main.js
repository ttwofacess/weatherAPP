// js/main.js — Orquestador: conecta módulos y maneja eventos de usuario

import { rateLimiter, sanitizeHTML } from './utils.js';
import { getActiveLang, t, initLanguageSwitch } from './i18n.js';
import { fetchApiKey, fetchWeather, fetchForecast, getApiKey, hasApiKeyError } from './api.js';
import { updateMap } from './map.js';
import { updateCityTime, startClock } from './time.js';
import { renderWeatherCard, renderForecast, initDonateModal, showAppNotice, hideAppNotice } from './ui.js';

// ─── Inicialización ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initLanguageSwitch();
    initDonateModal();
    startClock();

    // Pre-carga la API key en background sin bloquear la UI
    fetchApiKey()
        .then(() => hideAppNotice())
        .catch(() => {
            // El aviso queda visible hasta que la app se recargue. No se
            // reintenta: /api/config falló y el módulo ya no vuelve a llamar.
            console.warn('Initial API key fetch failed. Weather search disabled until reload.');
            showAppNotice(t().apiLoadError);
        });
});

// ─── Búsqueda de clima ───────────────────────────────────────────────────────

document.getElementById('weatherForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const cityInput = document.getElementById('cityInput').value.trim();

    if (!cityInput) {
        alert(t().invalidCity);
        return;
    }

    try {
        rateLimiter.checkLimit();
    } catch {
        alert(t().rateLimitError);
        return;
    }

    try {
        // Usa la key cacheada, o la carga si aún no ha fallado nunca. Si ya
        // falló, hasApiKeyError() es true y no se reintenta: se muestra el
        // aviso y se detiene, en vez de fallar en silencio.
        let apiKey = getApiKey();

        if (!apiKey && !hasApiKeyError()) {
            apiKey = await fetchApiKey().catch(() => null);
        }

        if (!apiKey) {
            showAppNotice(t().apiLoadError);
            return;
        }

        hideAppNotice();
        await searchWeather(cityInput, apiKey);

    } catch (error) {
        console.error('Error preparing weather search:', error.message);
    }
});

// ─── Flujo principal de búsqueda ─────────────────────────────────────────────

/**
 * Orquesta la obtención y presentación del clima y pronóstico.
 * @param {string} city
 * @param {string} apiKey
 */
async function searchWeather(city, apiKey) {
    const lang = getActiveLang();
    const strings = t();

    try {
        // 1. Clima actual
        const weatherData = await fetchWeather(city, apiKey, lang);

        if (weatherData.cod !== 200) {
            throw new Error(
                `${strings.dataError}: ${weatherData.message || strings.invalidResponse}`
            );
        }

        renderWeatherCard(weatherData);
        updateCityTime(weatherData.timezone);
        updateMap(
            { lat: weatherData.coord.lat, lon: weatherData.coord.lon, name: sanitizeHTML(weatherData.name) },
            apiKey
        );

        // 2. Pronóstico
        const forecastData = await fetchForecast(city, apiKey, lang);

        if (forecastData.cod !== '200') {
            throw new Error(
                `${strings.forecastDataError}: ${forecastData.message || strings.invalidResponse}`
            );
        }

        renderForecast(forecastData);

    } catch (error) {
        console.error('Weather search error:', error);
        alert(`${t().weatherError}: ${error.message}`);
    }
}
