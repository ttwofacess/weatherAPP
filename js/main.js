// js/main.js — Orquestador: conecta módulos y maneja eventos de usuario

import { rateLimiter, sanitizeHTML } from './utils.js';
import { getActiveLang, t, initLanguageSwitch } from './i18n.js';
import { fetchApiKey, fetchWeather, fetchForecast, getApiKey, hasApiKeyError } from './api.js';
import { updateMap } from './map.js';
import { updateCityTime, startClock } from './time.js';
import { renderWeatherCard, renderForecast, initDonateModal } from './ui.js';

// ─── Inicialización ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initLanguageSwitch();
    initDonateModal();
    startClock();

    // Pre-carga la API key en background sin bloquear la UI
    fetchApiKey().catch(() => {
        console.warn('Initial API key fetch failed. Will retry on form submit.');
    });
});

// ─── Búsqueda de clima ───────────────────────────────────────────────────────

document.getElementById('weatherForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const cityInput = document.getElementById('cityInput').value.trim();

    if (!cityInput || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s,-]+$/.test(cityInput)) {
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
        // Usa la key cacheada o la carga si no está disponible aún
        let apiKey = getApiKey();
        if (!apiKey && !hasApiKeyError()) {
            apiKey = await fetchApiKey();
        }
        if (!apiKey) return; // fetchApiKey ya mostró el alert

        await searchWeather(cityInput, apiKey);

    } catch (error) {
        // Errores de fetchApiKey ya se alertaron dentro del módulo api.js
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
            throw new Error(sanitizeHTML(
                `${strings.dataError}: ${weatherData.message || strings.invalidResponse}`
            ));
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
            throw new Error(sanitizeHTML(
                `${strings.forecastDataError}: ${forecastData.message || strings.invalidResponse}`
            ));
        }

        renderForecast(forecastData);

    } catch (error) {
        console.error('Weather search error:', error);
        alert(`${t().weatherError}: ${error.message}`);
    }
}
