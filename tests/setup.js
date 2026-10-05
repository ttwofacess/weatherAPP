// tests/setup.js — Entorno global de los tests

import { afterEach, beforeEach, vi } from 'vitest';

// jsdom no implementa navigator.clipboard; lo define ui.js en el modal de donaciones.
if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
        writable: true,
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
}

// jsdom no implementa window.alert
if (!window.alert) {
    window.alert = vi.fn();
}

// localStorage limpio entre archivos de test
beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});