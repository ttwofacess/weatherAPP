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

document.getElementById('weatherForm').addEventListener('submit', function(event) {
    event.preventDefault();

    /* const cityInput = document.getElementById('cityInput').value; */
    const cityInput = document.getElementById('cityInput').value.trim();
    
    // Validación básica de la entrada
    if (!cityInput || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s,-]+$/.test(cityInput)) {
        alert('Por favor ingrese un nombre de ciudad válido');
        return;
    }

    const currentDate = new Date().toISOString();  //Obtiene la fecha actual en formato ISO

     // Datos a enviar
    const data = {
        city: cityInput,
        date: currentDate    
    }; 

    // Envía los datos al servidor
    fetch('saveCity.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        console.log('Success:', data);
        // Aquí se maneja la respuesta del servidor, mostrar un mensaje al usuario, etc.
    })
    .catch((error) => {
        console.error('Error:', error);
    });

    const city = document.getElementById('cityInput').value;
    getWeather(city);
});

let apiKey;
let map;
let marker;

/* fetch('getApiKey.php')
    .then(response => response.json()) */
    // Replace the fetch calls in getWeather function
    fetchWithTimeout('getApiKey.php')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
    .then(data => {
        apiKey = data.apiKey;
    })
    .catch(error => console.error('Error:', error));

    // Limitar las llamadas a la API
    const rateLimiter = {
        lastCall: 0,
        minInterval: 2000, // 2 segundos entre llamadas
        
        checkLimit() {
            const now = Date.now();
            if (now - this.lastCall < this.minInterval) {
                throw new Error('Por favor espere antes de realizar otra búsqueda');
            }
            this.lastCall = now;
        }
    };

function getWeather(city) {
    try {
        rateLimiter.checkLimit();
        if(!apiKey) {
            console.error('API key not loaded');
            return;
        } 
    
        //const apiKey = ''; // clave de API 
        const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=es&appid=${apiKey}`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=metric&lang=es&appid=${apiKey}`;

        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                if (data.cod === 200) {
                    /* document.getElementById('cityName').textContent = data.name; */
                    document.getElementById('cityName').textContent = sanitizeHTML(data.name);
                    /* document.getElementById('temperature').textContent = data.main.temp.toFixed(1); */  //Formatear temp a 1 digito
                    document.getElementById('temperature').textContent = sanitizeHTML(data.main.temp.toFixed(1));
                    /* document.getElementById('description').textContent = data.weather[0].description; */
                    document.getElementById('description').textContent = sanitizeHTML(data.weather[0].description);
                    /* document.getElementById('wind').textContent = data.wind.speed.toFixed(1); */ //agrego viento
                    document.getElementById('wind').textContent = sanitizeHTML(data.wind.speed.toFixed(1));
                    /* document.getElementById('humidity').textContent = data.main.humidity; */ //humedad
                    document.getElementById('humidity').textContent = sanitizeHTML(data.main.humidity);

                    //actualizar la hora de la ciudad
                    updateCityTime(data.timezone);

                    document.getElementById('weatherResult').classList.remove('hidden');

                    // Muestra el mapa
                    const lat = data.coord.lat;
                    const lon = data.coord.lon;

                    // Si el mapa ya existe, resetear su vista y eliminar el marcador anterior
                    if (map) {
                        map.setView([lat, lon], 10);
                        map.eachLayer(layer => {
                            if (layer instanceof L.TileLayer) {
                                map.removeLayer(layer);
                            }
                        });
                        if (marker) {
                            map.removeLayer(marker);
                        }
                    } else {
                        // Si el mapa no existe, inicializarlo
                        map = L.map('map').setView([lat, lon], 10);
                    }

                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    }).addTo(map);

                    marker = L.marker([lat, lon]).addTo(map)
                        .bindPopup(`${data.name}`)
                        .openPopup();

                    // Añadir capa de temperaturas de OpenWeatherMap
                    L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
                        attribution: '&copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>'
                    }).addTo(map);    

                    fetch(forecastUrl)
                        .then(response => response.json())
                        .then(forecastData => {
                            if (forecastData.cod === "200") {
                                displayForecast(forecastData);
                            } else {
                                alert('Error al obtener el pronóstico');
                            }
                        })
                        .catch(error => {
                            console.error('Error fetching forecast data:', error);
                            alert('Hubo un error al obtener el pronóstico del clima');
                        });
                } else {
                    alert('Ciudad no encontrada');
                }
            })
            .catch(error => {
                console.error('Error fetching weather data:', error);
                alert('Hubo un error al obtener los datos del clima');
            });
        }
    catch (error) {
        alert(error.message);
        return;
    }
}

//funcion para actualizar la hora actual
function updateCurrentTime() {
    const currentTime = new Date();
    const timeString = currentTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('currentTime').textContent = timeString;
}

//funcion para actualizar la hora de la ciudad
function updateCityTime(timezone) {
    const cityTime = new Date(new Date().getTime() + timezone * 1000);
    const timeString = cityTime.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
    });
    document.getElementById('currentTime').textContent = timeString;
}

//actualizar la hora cada minuto
setInterval(() => {
    const timezone = parseInt(document.getElementById('currentTime').dataset.timezone || '0');
    updateCityTime(timezone);
}, 60000);

function displayForecast(forecastData) {
    const forecastContainer = document.getElementById('forecast');
    forecastContainer.innerHTML = ''; // Clear previous forecast

    // Get forecasts for the next 48 hours (8 three-hourly intervals per day)
    const forecastItems = forecastData.list.slice(0, 16);
    forecastItems.forEach(item => {
        const forecastItem = document.createElement('div');
        forecastItem.classList.add('forecast-item');

        const date = new Date(item.dt * 1000);
        const hours = date.getHours();
        const day = date.toLocaleDateString('es-ES', { weekday: 'short' });
        const temp = item.main.temp.toFixed(1);  //Formatear la temperatura a un decimal
        const description = item.weather[0].description;
        const iconCode = item.weather[0].icon;  //Obtener el codigo del icono
        const iconUrl = `http://openweathermap.org/img/wn/${iconCode}.png`;  //Construir la URL del icono

        /* forecastItem.innerHTML = `
            <div class="forecast-time">${day} ${hours}:00</div> 
            <div class="forecast-temp">${temp}°C</div>
            <div class="forecast-icon"><img src="${iconUrl}" alt="${description}"></div>
            <div class="forecast-desc">${description}</div>
        `; */

        forecastItem.innerHTML = `
        <div class="forecast-time">${sanitizeHTML(day)} ${sanitizeHTML(String(hours))}:00</div>
        <div class="forecast-temp">${sanitizeHTML(String(temp))}°C</div>
        <div class="forecast-icon"><img src="${sanitizeHTML(iconUrl)}" alt="${sanitizeHTML(description)}"></div>
        <div class="forecast-desc">${sanitizeHTML(description)}</div>
    `;

        forecastContainer.appendChild(forecastItem);
    });
}
