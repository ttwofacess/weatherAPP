// js/i18n.js — Internacionalización: strings y lógica de cambio de idioma

export const translations = {
    es: {
        // Alertas y errores
        invalidCity:     'Por favor ingrese un nombre de ciudad válido.',
        apiLoadError:    'No se pudo cargar la configuración de la aplicación. La funcionalidad del clima estará deshabilitada. Por favor, inténtelo más tarde.',
        apiKeyMissing:   'Error crítico: Falta la clave API para la búsqueda del clima.',
        rateLimitError:  'Por favor espere antes de realizar otra búsqueda.',
        cityNotFound:    'Ciudad no encontrada por OpenWeatherMap.',
        unauthorized:    'API key inválida o no autorizada por OpenWeatherMap.',
        httpError:       'Error HTTP de OpenWeatherMap',
        forecastError:   'Error al obtener el pronóstico de OpenWeatherMap.',
        weatherError:    'Hubo un error',
        dataError:       'Ciudad no encontrada o error en datos',
        forecastDataError: 'Error al obtener el pronóstico',
        invalidResponse: 'Respuesta inválida',

        // Locale para formateo de fechas/horas
        timeLocale: 'es-ES',
        weekdayFormat: { weekday: 'short', timeZone: 'UTC' },
        timeFormat: { hour: '2-digit', minute: '2-digit' },
    },
    en: {
        invalidCity:     'Please enter a valid city name.',
        apiLoadError:    'Could not load application settings. Weather functionality will be disabled. Please try again later.',
        apiKeyMissing:   'Critical error: Missing API key for weather search.',
        rateLimitError:  'Please wait before making another search.',
        cityNotFound:    'City not found by OpenWeatherMap.',
        unauthorized:    'Invalid or unauthorized API key from OpenWeatherMap.',
        httpError:       'OpenWeatherMap HTTP Error',
        forecastError:   'Error getting forecast from OpenWeatherMap.',
        weatherError:    'There was an error',
        dataError:       'City not found or data error',
        forecastDataError: 'Error getting forecast',
        invalidResponse: 'Invalid response',

        timeLocale: 'en-US',
        weekdayFormat: { weekday: 'short', timeZone: 'UTC' },
        timeFormat: { hour: '2-digit', minute: '2-digit' },
    },
};

const LANG_KEY = 'weatherapp_lang';

/**
 * Devuelve el idioma activo ('es' | 'en') leyendo localStorage.
 * Si no hay preferencia guardada, infiere desde la URL.
 */
export function getActiveLang() {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'es') return stored;
    return window.location.pathname.includes('index_en.html') ? 'en' : 'es';
}

/** Devuelve el objeto de strings para el idioma activo. */
export function t() {
    return translations[getActiveLang()];
}

/**
 * Inicializa el toggle de idioma.
 * Sincroniza el estado visual del switch y registra el listener de cambio.
 */
export function initLanguageSwitch() {
    const switchEl = document.getElementById('language-switch');
    if (!switchEl) {
        console.warn('language-switch element not found.');
        return;
    }

    const lang = getActiveLang();
    switchEl.checked = (lang === 'en');

    switchEl.addEventListener('change', function () {
        const selected = this.checked ? 'en' : 'es';
        localStorage.setItem(LANG_KEY, selected);

        const target = selected === 'en' ? 'index_en.html' : 'index.html';
        const currentFile = window.location.pathname.split('/').pop();

        if (currentFile !== target) {
            window.location.href = target;
        }
    });
}
