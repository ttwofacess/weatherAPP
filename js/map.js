// js/map.js — Gestión del mapa Leaflet (inicialización, marcador, capa de temperatura)

let map = null;
let marker = null;
let tempOverlayLayer = null;

/**
 * Inicializa el mapa o mueve la vista si ya existe.
 * @param {number} lat
 * @param {number} lon
 */
function initOrMoveMap(lat, lon) {
    if (map) {
        map.setView([lat, lon], 10);
        if (marker) map.removeLayer(marker);
    } else {
        map = L.map('map').setView([lat, lon], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
    }
}

/**
 * Actualiza el marcador con el nombre de la ciudad.
 *
 * El contenido del popup se pasa como nodo y no como string a propósito:
 * Leaflet asigna los strings con innerHTML (ver _updateContent en
 * assets/leaflet/leaflet.js) y los nodos con appendChild. Con textContent
 * el nombre nunca se parsea como HTML, así que no depende de que el
 * llamador lo haya escapado.
 * @param {number} lat
 * @param {number} lon
 * @param {string} cityName - Texto plano, se muestra tal cual
 */
function updateMarker(lat, lon, cityName) {
    const label = document.createElement('span');
    label.textContent = cityName;

    marker = L.marker([lat, lon]).addTo(map).bindPopup(label).openPopup();
}

/**
 * Reemplaza la capa de temperatura OWM.
 * @param {string} apiKey
 */
function updateTempOverlay(apiKey) {
    if (tempOverlayLayer && map.hasLayer(tempOverlayLayer)) {
        map.removeLayer(tempOverlayLayer);
    }
    tempOverlayLayer = L.tileLayer(
        `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`,
        { attribution: '© <a href="https://openweathermap.org/">OpenWeatherMap</a>' }
    );
    tempOverlayLayer.addTo(map);
}

/**
 * Punto de entrada principal: actualiza mapa completo con los datos de una ciudad.
 * @param {{ lat: number, lon: number, name: string }} coords - name en texto plano
 * @param {string} apiKey
 */
export function updateMap(coords, apiKey) {
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.classList.remove('hidden');

    const { lat, lon, name } = coords;
    initOrMoveMap(lat, lon);
    updateMarker(lat, lon, name);
    updateTempOverlay(apiKey);
}
