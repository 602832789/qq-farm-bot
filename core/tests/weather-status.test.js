const test = require('node:test');
const assert = require('node:assert/strict');

const {
    weatherIdName,
    isWeatherActive,
} = require('../dist/services/weather-status');

test('weather kind is determined by weather_id rather than weather_type', () => {
    const thunderstorm = { weather_id: 1, weather_type: 2, active: false };

    assert.equal(weatherIdName(thunderstorm.weather_id), '雷雨');
    assert.equal(isWeatherActive(thunderstorm), true);
});

test('weather_id zero remains no special weather even when other fields are set', () => {
    const noWeather = { weather_id: 0, weather_type: 2, active: true };

    assert.equal(weatherIdName(noWeather.weather_id), '无');
    assert.equal(isWeatherActive(noWeather), false);
});
