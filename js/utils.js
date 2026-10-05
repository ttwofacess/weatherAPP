// js/utils.js — Utilidades puras (sin efectos secundarios, sin DOM)

const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/**
 * Escapa texto para insertarlo en nodos de texto y en atributos entrecomillados.
 * Escapa comillas porque el resultado se interpola en plantillas innerHTML
 * (p. ej. ui.js renderForecast), donde un " sin escapar rompe el atributo.
 */
export function sanitizeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

export function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000, ...rest } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    return fetch(resource, { ...rest, signal: controller.signal })
        .finally(() => clearTimeout(id));
}

export const rateLimiter = {
    lastCall: 0,
    minInterval: 2000,
    checkLimit() {
        const now = Date.now();
        if (now - this.lastCall < this.minInterval) {
            throw new Error('RATE_LIMIT');
        }
        this.lastCall = now;
    },
};
