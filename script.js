// API key will be fetched from the serverless function
let openWeatherApiKey = null;
let apiKeyFetchError = false; // Flag to prevent repeated failed fetches

function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000 } = options;
    
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    return fetch(resource, {
        ...options,
        signal: controller.signal
    })
    .finally(() => clearTimeout(id));
}

// Function to fetch API key from our Cloudflare Function
async function fetchApiKey() {
    if (openWeatherApiKey) {
        return openWeatherApiKey; // Already fetched
    }
    if (apiKeyFetchError) { // If a previous attempt failed, don't try again immediately
        throw new Error('Previously failed to fetch API key.');
    }

    try {
        const response = await fetchWithTimeout('/api/config'); // Relative path to the function
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Unknown error fetching API key config" }));
            console.error(`Failed to fetch API key config: ${response.status}`, errorData);
            throw new Error(`Failed to fetch API key config: ${response.status} ${errorData.error || ''}`);
        }
        const config = await response.json();
        if (config.apiKey) {
            openWeatherApiKey = config.apiKey;
            console.log("API Key loaded successfully.");
            return openWeatherApiKey;
        } else {
            throw new Error('API key not found in server response.');
        }
    } catch (error) {
        console.error('Error fetching API key:', error.message);
        apiKeyFetchError = true; // Set flag on error
        alert('No se pudo cargar la configuración de la aplicación. La funcionalidad del clima estará deshabilitada. Por favor, inténtelo más tarde.');
        throw error; // Re-throw to be caught by callers
    }
}


document.getElementById('weatherForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const cityInputVal = document.getElementById('cityInput').value.trim();
    
    if (!cityInputVal || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s,-]+$/.test(cityInputVal)) {
        alert('Por favor ingrese un nombre de ciudad válido');
        return;
    }

    try {
        let currentApiKey = openWeatherApiKey;
        if (!currentApiKey && !apiKeyFetchError) { // If not fetched yet and no previous error
            currentApiKey = await fetchApiKey(); // Await the fetch
        }
        
        if (!currentApiKey) {
            // fetchApiKey would have already shown an alert if it failed
            console.error("API key not available. Weather search aborted.");
            // Optionally, re-alert or disable form
            // alert("La configuración de la API no está disponible. No se puede buscar el clima.");
            return;
        }
        getWeather(cityInputVal, currentApiKey);
    } catch (error) {
        // Error during fetchApiKey is handled within fetchApiKey itself with an alert.
        // This catch is mostly for other unexpected issues before calling getWeather.
        console.error("Error preparing for weather search:", error.message);
    }
});

let map;
let marker;
let tempOverlayLayer = null; // To store reference to the temperature layer

const rateLimiter = {
    lastCall: 0,
    minInterval: 2000,
    checkLimit() {
        const now = Date.now();
        if (now - this.lastCall < this.minInterval) {
            throw new Error('Por favor espere antes de realizar otra búsqueda');
        }
        this.lastCall = now;
    }
};

// Modified getWeather to accept apiKey as an argument
function getWeather(city, currentApiKey) { // No longer async, key is passed in
    try {
        rateLimiter.checkLimit();
        // API key check is done before calling getWeather now
        if(!currentApiKey) {
             // This case should ideally be prevented by the form submit handler
            console.error('API key not provided to getWeather function.');
            alert('Error crítico: Falta la clave API para la búsqueda del clima.');
            return;
        }
    
        const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&lang=es&appid=${currentApiKey}`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&lang=es&appid=${currentApiKey}`;

        fetchWithTimeout(apiUrl)
            .then(response => {
                if (!response.ok) {
                    if (response.status === 401) throw new Error('API key inválida o no autorizada por OpenWeatherMap.');
                    if (response.status === 404) throw new Error('Ciudad no encontrada por OpenWeatherMap.');
                    throw new Error(`Error HTTP de OpenWeatherMap: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Check for OpenWeatherMap's own error codes within a 200 response, if any.
                // For instance, sometimes they might send a 200 OK with an error message in the body.
                // However, standard practice is that data.cod === 200 is the success indicator here.
                if (data.cod === 200) {
                    document.getElementById('cityName').textContent = sanitizeHTML(data.name);
                    document.getElementById('temperature').textContent = sanitizeHTML(data.main.temp.toFixed(1));
                    document.getElementById('description').textContent = sanitizeHTML(data.weather[0].description);
                    document.getElementById('wind').textContent = sanitizeHTML(data.wind.speed.toFixed(1)) + " m/s";
                    document.getElementById('humidity').textContent = sanitizeHTML(String(data.main.humidity));

                    updateCityTime(data.timezone);

                    document.getElementById('weatherResult').classList.remove('hidden');

                    const lat = data.coord.lat;
                    const lon = data.coord.lon;

                    if (map) {
                        map.setView([lat, lon], 10);
                        if (marker) {
                            map.removeLayer(marker);
                        }
                    } else {
                        map = L.map('map').setView([lat, lon], 10);
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        }).addTo(map);
                    }

                    marker = L.marker([lat, lon]).addTo(map)
                        .bindPopup(`${sanitizeHTML(data.name)}`)
                        .openPopup();
                    
                    if (tempOverlayLayer && map.hasLayer(tempOverlayLayer)) {
                        map.removeLayer(tempOverlayLayer);
                    }
                    tempOverlayLayer = L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${currentApiKey}`, {
                        attribution: '© <a href="https://openweathermap.org/">OpenWeatherMap</a>'
                    });
                    tempOverlayLayer.addTo(map);

                    return fetchWithTimeout(forecastUrl); // Chain the promise
                } else {
                    // Handle cases where OpenWeatherMap API returns a 200 but with an error message (e.g. data.message)
                    throw new Error(sanitizeHTML('Ciudad no encontrada o error en datos: ' + (data.message || 'Respuesta inválida')));
                }
            })
            .then(forecastResponse => { // This .then is for the forecastUrl fetch
                if (!forecastResponse) return; // In case the previous chain didn't return a response (e.g. error thrown)
                if (!forecastResponse.ok) throw new Error('Error al obtener el pronóstico de OpenWeatherMap.');
                return forecastResponse.json();
            })
            .then(forecastData => {
                if (!forecastData) return;
                if (forecastData.cod === "200") {
                    displayForecast(forecastData);
                } else {
                    throw new Error(sanitizeHTML('Error al obtener el pronóstico: ' + (forecastData.message || 'Respuesta inválida')));
                }
            })
            .catch(error => { // Catch errors from any part of the promise chain
                console.error('Error en el proceso de obtención del clima:', error);
                alert('Hubo un error: ' + error.message);
                // Optionally hide weather card if it was visible
                // document.getElementById('weatherResult').classList.add('hidden');
            });
        }
    catch (error) { // Catches synchronous errors like rateLimiter.checkLimit()
        alert(error.message);
    }
}

function updateCityTime(timezoneOffsetSeconds) {
    const nowUtc = new Date(Date.now() + new Date().getTimezoneOffset() * 60000);
    const cityTime = new Date(nowUtc.getTime() + timezoneOffsetSeconds * 1000);

    const timeString = cityTime.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
    });
    const currentTimeElement = document.getElementById('currentTime');
    currentTimeElement.textContent = timeString;
    currentTimeElement.dataset.timezoneOffset = timezoneOffsetSeconds;
}

setInterval(() => {
    const currentTimeElement = document.getElementById('currentTime');
    const timezoneOffset = currentTimeElement.dataset.timezoneOffset;
    if (timezoneOffset !== undefined && !document.getElementById('weatherResult').classList.contains('hidden')) {
        updateCityTime(parseInt(timezoneOffset));
    }
}, 60000);

function displayForecast(forecastData) {
    const forecastContainer = document.getElementById('forecast');
    forecastContainer.innerHTML = ''; 

    const forecastItems = forecastData.list.slice(0, 16);
    forecastItems.forEach(item => {
        const forecastItem = document.createElement('div');
        forecastItem.classList.add('forecast-item');

        // item.dt is UTC timestamp in seconds
        // forecastData.city.timezone is offset from UTC in seconds
        const localForecastTime = new Date((item.dt + forecastData.city.timezone) * 1000);

        const displayHours = localForecastTime.getUTCHours(); // Hours in the city's timezone
        const day = localForecastTime.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }); 

        const temp = item.main.temp.toFixed(1);
        const description = item.weather[0].description;
        const iconCode = item.weather[0].icon;
        const iconUrl = `https://openweathermap.org/img/wn/${iconCode}.png`;

        forecastItem.innerHTML = `
            <div class="forecast-time">${sanitizeHTML(day)} ${sanitizeHTML(String(displayHours).padStart(2, '0'))}:00</div>
            <div class="forecast-temp">${sanitizeHTML(String(temp))}°C</div>
            <div class="forecast-icon"><img src="${sanitizeHTML(iconUrl)}" alt="${sanitizeHTML(description)}"></div>
            <div class="forecast-desc">${sanitizeHTML(description)}</div>
        `;
        forecastContainer.appendChild(forecastItem);
    });
}

// Attempt to fetch API key on page load to have it ready.
// This is non-blocking for UI rendering.
fetchApiKey().catch(error => {
    // The alert is already handled within fetchApiKey.
    // This catch is just to prevent an unhandled promise rejection warning in the console.
    console.warn("Initial API key fetch failed on page load. Will retry on form submission if needed.");
});

// Modal functionality
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById("donateModal");
    const btn = document.getElementById("donateButton");
    const span = document.getElementsByClassName("close-button")[0];

    if(btn) {
        btn.onclick = function() {
            modal.style.display = "block";
        }
    }

    if(span) {
        span.onclick = function() {
            modal.style.display = "none";
        }
    }

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    const copyButtons = document.querySelectorAll('.copy-button');
    copyButtons.forEach(button => {
        button.addEventListener('click', () => {
            const inputId = button.getAttribute('data-copy');
            const input = document.getElementById(inputId);
            input.select();
            document.execCommand('copy');

            // Visual feedback
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                button.innerHTML = originalIcon;
            }, 1500);
        });
    });
});