export {};

const LongModule = require('long');

const WEATHER_ID_NAMES: Record<string, string> = {
    '0': '无',
    '1': '雷雨',
};

function weatherIdString(value: unknown): string {
    if (value == null) return '0';
    if (LongModule.isLong(value)) return value.toString();
    const text = String(value).trim();
    return /^-?\d+$/.test(text) ? text : '0';
}

function weatherIdName(value: unknown): string | null {
    const weatherId = weatherIdString(value);
    return Object.prototype.hasOwnProperty.call(WEATHER_ID_NAMES, weatherId)
        ? WEATHER_ID_NAMES[weatherId]
        : null;
}

function isWeatherActive(status: any): boolean {
    return weatherIdString(status?.weather_id) !== '0';
}

module.exports = {
    weatherIdName,
    isWeatherActive,
};
