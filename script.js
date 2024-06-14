/* document.getElementById('weatherForm').addEventListener('submit', function(event) {
    event.preventDefault();
    const city = document.getElementById('cityInput').value;
    getWeather(city);
});

function getWeather(city) {
    const apiKey = '8e79b74856ffb2bdaed36bec01cefe30'; // Reemplaza con tu clave de API de OpenWeatherMap
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=es&appid=${apiKey}`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            if (data.cod === 200) {
                document.getElementById('cityName').textContent = data.name;
                document.getElementById('temperature').textContent = data.main.temp;
                document.getElementById('description').textContent = data.weather[0].description;
                document.getElementById('weatherResult').classList.remove('hidden');
            } else {
                alert('Ciudad no encontrada');
            }
        })
        .catch(error => {
            console.error('Error fetching weather data:', error);
            alert('Hubo un error al obtener los datos del clima');
        });
}
 */

document.getElementById('weatherForm').addEventListener('submit', function(event) {
    event.preventDefault();
    const city = document.getElementById('cityInput').value;
    getWeather(city);
});

function getWeather(city) {
    const apiKey = '8e79b74856ffb2bdaed36bec01cefe30'; // Reemplaza con tu clave de API de OpenWeatherMap
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=es&appid=${apiKey}`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=metric&lang=es&appid=${apiKey}`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            if (data.cod === 200) {
                document.getElementById('cityName').textContent = data.name;
                /* document.getElementById('temperature').textContent = data.main.temp; */
                document.getElementById('temperature').textContent = data.main.temp.toFixed(1);  //Formatear temp a 1 digito
                document.getElementById('description').textContent = data.weather[0].description;
                document.getElementById('weatherResult').classList.remove('hidden');

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
        /* const temp = item.main.temp; */
        const temp = item.main.temp.toFixed(1);  //Formatear la temperatura a un decimal
        const description = item.weather[0].description;
/* const body = document.getElementById('bdy');
body.style.height = "215vh"; */
/* const container = document.getElementById('mover');
container.style.marginTop = "75rem"; */
        forecastItem.innerHTML = `
            <div class="forecast-time">${day} ${hours}:00</div>
            <div class="forecast-temp">${temp}°C</div>
            <div class="forecast-desc">${description}</div>
        `;

        forecastContainer.appendChild(forecastItem);
    });
}
