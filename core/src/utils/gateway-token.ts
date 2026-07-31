export {};
const crypto = require('node:crypto');

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function createGatewayToken(): string {
    const length = 64 + crypto.randomInt(64);
    const bytes: Buffer = crypto.randomBytes(length);
    let token = '';
    for (let i = 0; i < length; i++) {
        token += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
    }
    return `${token}=`;
}

module.exports = { createGatewayToken };
