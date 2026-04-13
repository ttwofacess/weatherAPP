// js/time.js — Lógica de tiempo y zona horaria (sin dependencia del DOM más allá del elemento recibido)

import { t } from './i18n.js';

/**
 * Calcula la hora local de una ciudad a partir del offset UTC de OWM.
 * @param {number} timezoneOffsetSeconds - Campo `timezone` de la respuesta OWM
 * @returns {Date}
 */
export function getCityTime(timezoneOffsetSeconds) {
    const nowUtc = new Date(Date.now() + new Date().getTimezoneOffset() * 60000);
    return new Date(nowUtc.getTime() + timezoneOffsetSeconds * 1000);
}

/**
 * Formatea un Date a string de hora según el idioma activo.
 * @param {Date} date
 * @returns {string}
 */
export function formatTime(date) {
    return date.toLocaleTimeString(t().timeLocale, t().timeFormat);
}

/**
 * Actualiza el elemento #currentTime con la hora de la ciudad y guarda
 * el offset en data- para que el intervalo pueda actualizar sin pasar props.
 * @param {number} timezoneOffsetSeconds
 */
export function updateCityTime(timezoneOffsetSeconds) {
    const el = document.getElementById('currentTime');
    if (!el) return;
    el.textContent = formatTime(getCityTime(timezoneOffsetSeconds));
    el.dataset.timezoneOffset = timezoneOffsetSeconds;
}

/**
 * Arranca el reloj que actualiza la hora cada minuto.
 * Solo actualiza si el weather card es visible.
 * Devuelve el id del intervalo por si se necesita limpiar.
 * @returns {number} intervalId
 */
export function startClock() {
    return setInterval(() => {
        const el = document.getElementById('currentTime');
        const card = document.getElementById('weatherResult');
        if (!el || !card || card.classList.contains('hidden')) return;

        const offset = el.dataset.timezoneOffset;
        if (offset !== undefined) {
            updateCityTime(parseInt(offset, 10));
        }
    }, 60_000);
}
