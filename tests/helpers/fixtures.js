// tests/helpers/fixtures.js — Builders de DOM y payloads de la API

/**
 * Reproduce la estructura de index.html que los módulos tocan.
 * Se usa document.body.innerHTML para no depender de leer el HTML real.
 */
export function mountAppDom() {
    document.body.innerHTML = `
        <div class="language-switch-container">
            <label class="switch">
                <input type="checkbox" id="language-switch">
            </label>
        </div>

        <form id="weatherForm">
            <input type="text" id="cityInput" required>
            <button type="submit">Buscar</button>
        </form>

        <div id="appNotice" class="app-notice hidden" role="alert"></div>

        <div id="welcomeContainer" class="welcome-container"></div>

        <div id="weatherResult" class="weather-card hidden">
            <div id="cityName"></div>
            <div id="currentTime"></div>
            <div><span id="temperature"></span>°C</div>
            <div class="wind"><span id="wind"></span></div>
            <div class="humidity"><span id="humidity"></span>%</div>
            <div id="description"></div>
        </div>

        <div id="map" class="hidden"></div>
        <div id="forecast" class="forecast hidden"></div>

        <button id="donateButton" class="donate-button">Donar</button>

        <div id="donateModal" class="modal">
            <div class="modal-content">
                <span class="close-button">&times;</span>
                <input type="text" value="btc-addr" id="btcAddress" readonly>
                <button class="copy-button" data-copy="btcAddress"><i class="far fa-copy"></i></button>
            </div>
        </div>
    `;
}

/** Respuesta 200 de GET /data/2.5/weather */
export function weatherPayload(overrides = {}) {
    return {
        coord: { lon: -3.7038, lat: 40.4168 },
        weather: [{ id: 800, main: 'Clear', description: 'cielo claro', icon: '01d' }],
        main: { temp: 21.37, feels_like: 21.1, humidity: 45, pressure: 1014 },
        wind: { speed: 2.57 },
        name: 'Madrid',
        cod: 200,
        ...overrides,
    };
}

/** Respuesta 200 de GET /data/2.5/forecast (cod es STRING '200' en el forecast) */
export function forecastPayload(list, overrides = {}) {
    const item = (dt, temp = 20, desc = 'cielo claro', icon = '01d') => ({
        dt,
        main: { temp },
        weather: [{ description: desc, icon }],
    });
    return {
        city: { name: 'Madrid', timezone: 7200 },
        list: list ?? [
            item(1756000000), item(1756003600), item(1756007200),
            ],
        cod: '200',
        ...overrides,
    };
}

/** Crea un Response-ish que satisface el contrato usado por api.js */
export function jsonResponse(body, { ok = true, status = 200 } = {}) {
    return {
        ok,
        status,
        json: () => Promise.resolve(body),
    };
}