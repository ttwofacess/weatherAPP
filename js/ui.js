// js/ui.js — Manipulación del DOM: weather card, forecast, modal de donaciones

import { sanitizeHTML } from './utils.js';
import { t } from './i18n.js';

// ─── Weather Card ────────────────────────────────────────────────────────────

/**
 * Rellena el weather card con los datos de la respuesta OWM y lo muestra.
 * @param {Object} data - Respuesta JSON de /data/2.5/weather
 */
export function renderWeatherCard(data) {
    document.getElementById('cityName').textContent       = sanitizeHTML(data.name);
    document.getElementById('temperature').textContent    = sanitizeHTML(data.main.temp.toFixed(1));
    document.getElementById('description').textContent   = sanitizeHTML(data.weather[0].description);
    document.getElementById('wind').textContent          = `${sanitizeHTML(data.wind.speed.toFixed(1))} m/s`;
    document.getElementById('humidity').textContent      = sanitizeHTML(String(data.main.humidity));

    document.getElementById('weatherResult').classList.remove('hidden');
}

// ─── Forecast ────────────────────────────────────────────────────────────────

/**
 * Renderiza los próximos 16 intervalos del pronóstico.
 * @param {Object} forecastData - Respuesta JSON de /data/2.5/forecast
 */
export function renderForecast(forecastData) {
    const container = document.getElementById('forecast');
    container.innerHTML = '';

    forecastData.list.slice(0, 16).forEach(item => {
        const localTime = new Date((item.dt + forecastData.city.timezone) * 1000);
        const hours     = String(localTime.getUTCHours()).padStart(2, '0');
        const day       = localTime.toLocaleDateString(t().timeLocale, t().weekdayFormat);

        const el = document.createElement('div');
        el.classList.add('forecast-item');
        el.innerHTML = `
            <div class="forecast-time">${sanitizeHTML(day)} ${sanitizeHTML(hours)}:00</div>
            <div class="forecast-temp">${sanitizeHTML(item.main.temp.toFixed(1))}°C</div>
            <div class="forecast-icon">
                <img src="${sanitizeHTML(`https://openweathermap.org/img/wn/${item.weather[0].icon}.png`)}"
                     alt="${sanitizeHTML(item.weather[0].description)}">
            </div>
            <div class="forecast-desc">${sanitizeHTML(item.weather[0].description)}</div>
        `;
        container.appendChild(el);
    });
}

// ─── Donate Modal ────────────────────────────────────────────────────────────

/**
 * Inicializa el modal de donaciones: abrir, cerrar, copiar al clipboard.
 */
export function initDonateModal() {
    const modal = document.getElementById('donateModal');
    const btn   = document.getElementById('donateButton');
    const close = document.querySelector('.close-button');

    if (!modal || !btn || !close) return;

    btn.onclick   = () => { modal.style.display = 'block'; };
    close.onclick = () => { modal.style.display = 'none'; };

    window.addEventListener('click', e => {
        if (e.target === modal) modal.style.display = 'none';
    });

    document.querySelectorAll('.copy-button').forEach(button => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.getAttribute('data-copy'));
            if (!input) return;

            navigator.clipboard.writeText(input.value).then(() => {
                const original = button.innerHTML;
                button.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => { button.innerHTML = original; }, 1500);
            }).catch(err => console.error('Failed to copy:', err));
        });
    });
}
