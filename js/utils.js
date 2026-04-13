// js/utils.js — Utilidades puras (sin efectos secundarios, sin DOM)

export function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
