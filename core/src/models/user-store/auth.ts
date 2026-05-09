export {};
const fs = require('node:fs');
const crypto = require('node:crypto');
const { getDataFile, ensureDataDir } = require('../../config/runtime-paths');

const LOGIN_ATTEMPTS_FILE: string = getDataFile('login-attempts.json');
const LOGIN_LOGS_FILE: string = getDataFile('login-logs.json');

const SALT_LENGTH: number = 32;
const ITERATIONS: number = 100000;
const KEY_LENGTH: number = 64;
const DIGEST: string = 'sha512';

const MAX_LOGIN_ATTEMPTS: number = 5;
const LOCKOUT_DURATION: number = 15 * 60 * 1000;
const RATE_LIMIT_WINDOW: number = 60 * 1000;
const MAX_ATTEMPTS_PER_IP: number = 10;

interface LoginAttempt {
    count: number;
    windowStart?: number;
    firstAttempt?: number;
    lastAttempt?: number;
    lockedUntil?: number;
}

interface LoginLogEntry {
    id: string;
    timestamp: number;
    [key: string]: any;
}

interface RateLimitResult {
    allowed: boolean;
    remainingMs?: number;
    message?: string;
}

interface LockoutResult {
    locked: boolean;
    remainingMs?: number;
    message?: string;
}

interface FailedAttemptResult {
    locked: boolean;
    message?: string;
    remainingAttempts?: number;
}

interface PasswordStrengthResult {
    valid: boolean;
    errors: string[];
}

let loginAttempts: Record<string, LoginAttempt> = {};
let loginLogs: LoginLogEntry[] = [];

function loadLoginLogs(): void {
    try {
        ensureDataDir();
        if (fs.existsSync(LOGIN_LOGS_FILE)) {
            const data = JSON.parse(fs.readFileSync(LOGIN_LOGS_FILE, 'utf8'));
            loginLogs = Array.isArray(data.logs) ? data.logs : [];
        }
    } catch (e) {
        loginLogs = [];
    }
}

function saveLoginLogs(): void {
    try {
        ensureDataDir();
        const maxLogs = 1000;
        const logsToSave = loginLogs.slice(-maxLogs);
        fs.writeFileSync(LOGIN_LOGS_FILE, JSON.stringify({ logs: logsToSave }, null, 2), 'utf8');
    } catch (e: any) {
        console.error('保存登录日志失败:', e.message);
    }
}

function addLoginLog(entry: Record<string, any>): LoginLogEntry {
    loadLoginLogs();
    const logEntry: LoginLogEntry = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        ...entry
    };
    loginLogs.push(logEntry);
    if (loginLogs.length > 1000) {
        loginLogs = loginLogs.slice(-1000);
    }
    saveLoginLogs();
    return logEntry;
}

function getLoginLogs(limit: number = 100, offset: number = 0): { logs: LoginLogEntry[]; total: number } {
    loadLoginLogs();
    const sorted = [...loginLogs].sort((a, b) => b.timestamp - a.timestamp);
    return {
        logs: sorted.slice(offset, offset + limit),
        total: loginLogs.length
    };
}

function clearLoginLogs(): { ok: boolean } {
    loginLogs = [];
    saveLoginLogs();
    return { ok: true };
}

function loadLoginAttempts(): void {
    try {
        ensureDataDir();
        if (fs.existsSync(LOGIN_ATTEMPTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(LOGIN_ATTEMPTS_FILE, 'utf8'));
            loginAttempts = data || {};
        }
    } catch (e) {
        loginAttempts = {};
    }
}

function saveLoginAttempts(): void {
    try {
        ensureDataDir();
        fs.writeFileSync(LOGIN_ATTEMPTS_FILE, JSON.stringify(loginAttempts, null, 2), 'utf8');
    } catch (e: any) {
        console.error('保存登录尝试记录失败:', e.message);
    }
}

function cleanExpiredAttempts(): void {
    const now = Date.now();
    let cleaned = false;

    for (const key of Object.keys(loginAttempts)) {
        const attempt = loginAttempts[key];
        if (attempt.lockedUntil && attempt.lockedUntil < now) {
            delete loginAttempts[key];
            cleaned = true;
        } else if (attempt.windowStart && (now - attempt.windowStart) > RATE_LIMIT_WINDOW) {
            delete loginAttempts[key];
            cleaned = true;
        }
    }

    if (cleaned) saveLoginAttempts();
}

function checkRateLimit(ip: string): RateLimitResult {
    cleanExpiredAttempts();
    const ipKey = `ip:${ip}`;
    const now = Date.now();

    if (!loginAttempts[ipKey]) {
        loginAttempts[ipKey] = { count: 1, windowStart: now };
        saveLoginAttempts();
        return { allowed: true };
    }

    const attempt = loginAttempts[ipKey];

    if (now - (attempt.windowStart || 0) > RATE_LIMIT_WINDOW) {
        loginAttempts[ipKey] = { count: 1, windowStart: now };
        saveLoginAttempts();
        return { allowed: true };
    }

    if (attempt.count >= MAX_ATTEMPTS_PER_IP) {
        const remainingMs = RATE_LIMIT_WINDOW - (now - (attempt.windowStart || 0));
        return {
            allowed: false,
            remainingMs,
            message: `请求过于频繁，请 ${Math.ceil(remainingMs / 1000)} 秒后重试`
        };
    }

    attempt.count++;
    saveLoginAttempts();
    return { allowed: true };
}

function checkAccountLockout(username: string): LockoutResult {
    cleanExpiredAttempts();
    const userKey = `user:${username}`;
    const now = Date.now();

    if (loginAttempts[userKey] && loginAttempts[userKey].lockedUntil) {
        if (loginAttempts[userKey].lockedUntil! > now) {
            const remainingMs = loginAttempts[userKey].lockedUntil! - now;
            return {
                locked: true,
                remainingMs,
                message: `账户已被锁定，请 ${Math.ceil(remainingMs / 1000 / 60)} 分钟后重试`
            };
        } else {
            delete loginAttempts[userKey];
            saveLoginAttempts();
        }
    }

    return { locked: false };
}

function recordFailedAttempt(username: string): FailedAttemptResult {
    const userKey = `user:${username}`;
    const now = Date.now();

    if (!loginAttempts[userKey]) {
        loginAttempts[userKey] = { count: 1, firstAttempt: now };
    } else {
        loginAttempts[userKey].count++;
        loginAttempts[userKey].lastAttempt = now;
    }

    if (loginAttempts[userKey].count >= MAX_LOGIN_ATTEMPTS) {
        loginAttempts[userKey].lockedUntil = now + LOCKOUT_DURATION;
        saveLoginAttempts();
        return {
            locked: true,
            message: `登录失败次数过多，账户已被锁定 ${LOCKOUT_DURATION / 60000} 分钟`
        };
    }

    saveLoginAttempts();
    return {
        locked: false,
        remainingAttempts: MAX_LOGIN_ATTEMPTS - loginAttempts[userKey].count
    };
}

function clearFailedAttempts(username: string): void {
    const userKey = `user:${username}`;
    if (loginAttempts[userKey]) {
        delete loginAttempts[userKey];
        saveLoginAttempts();
    }
}

function validatePasswordStrength(password: string): PasswordStrengthResult {
    const errors: string[] = [];

    if (password.length < 6) {
        errors.push('密码长度至少6位');
    }

    if (password.length > 128) {
        errors.push('密码长度不能超过128位');
    }

    let typeCount = 0;
    if (/[a-z]/.test(password)) typeCount++;
    if (/[A-Z]/.test(password)) typeCount++;
    if (/\d/.test(password)) typeCount++;
    if (/[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'/`~]/.test(password)) typeCount++;

    if (typeCount < 2) {
        errors.push('密码必须包含大写字母、小写字母、数字、特殊符号中的至少两种');
    }

    const commonPasswords = [
        'password', '123456', 'qwerty', 'abc123', '111111', '000000'
    ];
    if (commonPasswords.includes(password.toLowerCase())) {
        errors.push('密码过于简单，请使用更复杂的密码');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

function hashPassword(password: string, salt: string | null = null): string {
    if (!salt) {
        salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    }

    const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedPassword: string): boolean {
    if (storedPassword.includes(':')) {
        const [salt, hash] = storedPassword.split(':');
        const newHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
        return hash === newHash;
    } else {
        const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
        return storedPassword === legacyHash;
    }
}

function needsRehash(storedPassword: string): boolean {
    return !storedPassword.includes(':');
}

module.exports = {
    loadLoginLogs,
    saveLoginLogs,
    addLoginLog,
    getLoginLogs,
    clearLoginLogs,
    loadLoginAttempts,
    saveLoginAttempts,
    cleanExpiredAttempts,
    checkRateLimit,
    checkAccountLockout,
    recordFailedAttempt,
    clearFailedAttempts,
    validatePasswordStrength,
    hashPassword,
    verifyPassword,
    needsRehash,
};
