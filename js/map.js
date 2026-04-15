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
 * @param {number} lat
 * @param {number} lon
 * @param {string} cityName - Ya sanitizado
 */
function updateMarker(lat, lon, cityName) {
    marker = L.marker([lat, lon]).addTo(map).bindPopup(cityName).openPopup();
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
 * @param {{ lat: number, lon: number, name: string }} coords
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
