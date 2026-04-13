// js/api.js — Comunicación con APIs externas (OpenWeatherMap) y función serverless

import { fetchWithTimeout } from './utils.js';
import { t } from './i18n.js';

let openWeatherApiKey = null;
let apiKeyFetchError = false;

/**
 * Obtiene la API key desde la Cloudflare Function en /api/config.
 * Cachea el resultado en módulo para no repetir la llamada.
 * @returns {Promise<string>} La API key
 */
export async function fetchApiKey() {
    if (openWeatherApiKey) return openWeatherApiKey;

    if (apiKeyFetchError) {
        throw new Error('Previously failed to fetch API key.');
    }

    try {
        const response = await fetchWithTimeout('/api/config');

        if (!response.ok) {
            const errorData = await response.json()
                .catch(() => ({ error: 'Unknown error fetching API key config' }));
            throw new Error(`Failed to fetch API key config: ${response.status} ${errorData.error || ''}`);
        }

        const config = await response.json();
        if (!config.apiKey) throw new Error('API key not found in server response.');

        openWeatherApiKey = config.apiKey;
        console.log('API Key loaded successfully.');
        return openWeatherApiKey;

    } catch (error) {
        console.error('Error fetching API key:', error.message);
        apiKeyFetchError = true;
        alert(t().apiLoadError);
        throw error;
    }
}

/** Expone si ya se cargó la key (para que main.js evite llamadas redundantes). */
export function getApiKey()           { return openWeatherApiKey; }
export function hasApiKeyError()      { return apiKeyFetchError; }

/**
 * Llama a la API de clima actual de OpenWeatherMap.
 * @param {string} city  - Nombre de ciudad (puede incluir código de país)
 * @param {string} apiKey
 * @param {string} lang  - Código de idioma para OWM ('es' | 'en')
 * @returns {Promise<Object>} Datos de clima
 */
export async function fetchWeather(city, apiKey, lang) {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&lang=${lang}&appid=${apiKey}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
        const strings = t();
        if (response.status === 401) throw new Error(strings.unauthorized);
        if (response.status === 404) throw new Error(strings.cityNotFound);
        throw new Error(`${strings.httpError}: ${response.status}`);
    }

    return response.json();
}

/**
 * Llama a la API de pronóstico de OpenWeatherMap.
 * @param {string} city
 * @param {string} apiKey
 * @param {string} lang
 * @returns {Promise<Object>} Datos de pronóstico
 */
export async function fetchForecast(city, apiKey, lang) {
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&lang=${lang}&appid=${apiKey}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) throw new Error(t().forecastError);

    return response.json();
}
