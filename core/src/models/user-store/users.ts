export {};
const fs = require('node:fs');
const { getDataFile, ensureDataDir } = require('../../config/runtime-paths');

const auth = require('./auth');

const USERS_FILE: string = getDataFile('users.json');
const CARDS_FILE: string = getDataFile('cards.json');

const DEFAULT_ACCOUNT_LIMIT: number = 2;

interface UserCard {
    code: string;
    description: string;
    days: number;
    expiresAt: number | null;
    enabled: boolean;
}

interface User {
    username: string;
    password: string;
    role: 'admin' | 'user';
    cardCode?: string;
    card?: UserCard;
    accountLimit?: number;
    createdAt: number;
    mustChangePassword?: boolean;
    wxLoginConfig?: Record<string, any>;
    [key: string]: any;
}

interface Card {
    code: string;
    description: string;
    days: number;
    type: 'time' | 'quota';
    enabled: boolean;
    usedBy: string | null;
    usedAt: number | null;
    createdAt: number;
}

interface ValidationResult {
    username?: string;
    role?: string;
    cardCode?: string | null;
    card?: UserCard | null;
    accountLimit?: number;
    error?: string;
    message?: string;
    remainingMs?: number;
}

interface RegisterResult {
    ok: boolean;
    error?: string;
    user?: {
        username: string;
        role: string;
        card: UserCard | undefined;
        accountLimit: number;
    };
}

interface RenewResult {
    ok: boolean;
    error?: string;
    card?: UserCard;
    accountLimit?: number;
    cardType?: string;
}

interface EditUpdates {
    newUsername?: string;
    password?: string;
    accountLimit?: number;
    isPermanent?: boolean;
    expiresAt?: number | null;
}

interface EditResult {
    ok: boolean;
    error?: string;
    user?: {
        username: string;
        role: string;
        card: UserCard | undefined;
        accountLimit: number;
    };
}

let users: User[] = [];
let cards: Card[] = [];

const generateCardCode = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

function loadUsers(): void {
    ensureDataDir();
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            users = Array.isArray(data.users) ? data.users : [];
        } else {
            users = [];
            saveUsers();
        }
    } catch (e: any) {
        console.error('加载用户数据失败:', e.message);
        users = [];
    }
}

function saveUsers(): void {
    ensureDataDir();
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf8');
    } catch (e: any) {
        console.error('保存用户数据失败:', e.message);
    }
}

function loadCards(): void {
    ensureDataDir();
    try {
        if (fs.existsSync(CARDS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
            cards = Array.isArray(data.cards) ? data.cards : [];
        } else {
            cards = [];
            saveCards();
        }
    } catch (e: any) {
        console.error('加载卡密数据失败:', e.message);
        cards = [];
    }
}

function saveCards(): void {
    ensureDataDir();
    try {
        fs.writeFileSync(CARDS_FILE, JSON.stringify({ cards }, null, 2), 'utf8');
    } catch (e: any) {
        console.error('保存卡密数据失败:', e.message);
    }
}

function initDefaultAdmin(): void {
    loadUsers();
    const adminExists = users.find(u => u.username === 'admin');
    if (!adminExists) {
        const defaultPassword = 'admin';
        users.push({
            username: 'admin',
            password: auth.hashPassword(defaultPassword),
            role: 'admin',
            createdAt: Date.now()
        });
        saveUsers();
        console.log('[用户系统] 已创建默认管理员账号，默认密码: admin');
    }
}

function validateUser(username: string, password: string, ip: string = 'unknown'): ValidationResult {
    loadUsers();
    auth.loadLoginAttempts();

    const rateLimitResult = auth.checkRateLimit(ip);
    if (!rateLimitResult.allowed) {
        return {
            error: 'rate_limit',
            message: rateLimitResult.message,
            remainingMs: rateLimitResult.remainingMs
        };
    }

    const lockoutResult = auth.checkAccountLockout(username);
    if (lockoutResult.locked) {
        return {
            error: 'locked',
            message: lockoutResult.message,
            remainingMs: lockoutResult.remainingMs
        };
    }

    const user = users.find(u => u.username === username);
    if (!user) {
        auth.recordFailedAttempt(username);
        return { error: 'invalid_credentials', message: '用户名或密码错误' };
    }

    if (!auth.verifyPassword(password, user.password)) {
        const attemptResult = auth.recordFailedAttempt(username);
        if (attemptResult.locked) {
            return {
                error: 'locked',
                message: attemptResult.message
            };
        }
        return {
            error: 'invalid_credentials',
            message: `用户名或密码错误，剩余尝试次数: ${attemptResult.remainingAttempts}`
        };
    }

    auth.clearFailedAttempts(username);

    if (auth.needsRehash(user.password)) {
        user.password = auth.hashPassword(password);
        saveUsers();
        console.log(`[安全] 用户 ${username} 密码已升级为新哈希算法`);
    }

    return {
        username: user.username,
        role: user.role,
        cardCode: user.cardCode || null,
        card: user.card || null,
        accountLimit: user.accountLimit || DEFAULT_ACCOUNT_LIMIT
    };
}

function registerUser(username: string, password: string, cardCode: string): RegisterResult {
    loadUsers();
    loadCards();

    if (!username || username.length < 3 || username.length > 32) {
        return { ok: false, error: '用户名长度需在3-32位之间' };
    }

    if (!/^\w+$/.test(username)) {
        return { ok: false, error: '用户名只能包含字母、数字和下划线' };
    }

    if (users.find(u => u.username === username)) {
        return { ok: false, error: '用户名已存在' };
    }

    const passwordValidation = auth.validatePasswordStrength(password);
    if (!passwordValidation.valid) {
        return { ok: false, error: passwordValidation.errors.join('；') };
    }

    const card = cards.find(c => c.code === cardCode);
    if (!card) {
        return { ok: false, error: '卡密不存在' };
    }

    if (!card.enabled) {
        return { ok: false, error: '卡密已被禁用' };
    }

    if (card.usedBy) {
        return { ok: false, error: '卡密已被使用' };
    }

    const cardType = card.type || 'time';
    if (cardType === 'quota') {
        return { ok: false, error: '注册只能使用时间卡密，额度卡密请登录后在续费中使用' };
    }

    const now = Date.now();

    const newUser: User = {
        username,
        password: auth.hashPassword(password),
        role: 'user',
        cardCode,
        card: {
            code: card.code,
            description: card.description,
            days: card.days,
            expiresAt: card.days === -1 ? null : (now + card.days * 24 * 60 * 60 * 1000),
            enabled: true
        },
        accountLimit: DEFAULT_ACCOUNT_LIMIT,
        createdAt: now
    };

    users.push(newUser);
    card.usedBy = username;
    card.usedAt = now;

    saveUsers();
    saveCards();

    auth.clearFailedAttempts(username);

    return { ok: true, user: { username: newUser.username, role: newUser.role, card: newUser.card, accountLimit: newUser.accountLimit! } };
}

function renewUser(username: string, cardCode: string): RenewResult {
    loadUsers();
    loadCards();

    const user = users.find(u => u.username === username);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }

    const card = cards.find(c => c.code === cardCode);
    if (!card) {
        return { ok: false, error: '卡密不存在' };
    }

    if (!card.enabled) {
        return { ok: false, error: '卡密已被禁用' };
    }

    if (card.usedBy) {
        return { ok: false, error: '卡密已被使用' };
    }

    const now = Date.now();
    const cardType = card.type || 'time';

    if (cardType === 'quota') {
        const currentLimit = user.accountLimit || DEFAULT_ACCOUNT_LIMIT;
        user.accountLimit = currentLimit + card.days;
    } else {
        if (!user.card) {
            user.card = {
                code: card.code,
                description: card.description,
                days: 0,
                expiresAt: null,
                enabled: true
            };
        }

        const currentExpires = user.card!.expiresAt || 0;
        const currentDays = user.card!.days || 0;

        if (card.days === -1) {
            user.card!.expiresAt = null;
            user.card!.days = -1;
        } else if (user.card!.days === -1) {
            user.card!.expiresAt = null;
        } else {
            user.card!.days = currentDays + card.days;

            if (currentExpires && currentExpires > now) {
                user.card!.expiresAt = currentExpires + card.days * 24 * 60 * 60 * 1000;
            } else {
                user.card!.expiresAt = now + card.days * 24 * 60 * 60 * 1000;
            }
        }
    }

    card.usedBy = username;
    card.usedAt = now;

    saveUsers();
    saveCards();

    return { ok: true, card: user.card, accountLimit: user.accountLimit || DEFAULT_ACCOUNT_LIMIT, cardType };
}

function getAllUsers(): Array<Pick<User, 'username' | 'role' | 'card' | 'accountLimit'>> {
    loadUsers();
    return users.map(u => ({
        username: u.username,
        role: u.role,
        card: u.card,
        accountLimit: u.accountLimit || DEFAULT_ACCOUNT_LIMIT
    }));
}

function updateUser(username: string, updates: Partial<Pick<User, 'card'>> & { expiresAt?: number | null; enabled?: boolean }): Pick<User, 'username' | 'role' | 'card' | 'accountLimit'> | null {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) return null;

    if (updates.expiresAt !== undefined) {
        if (!user.card) user.card = {} as UserCard;
        user.card!.expiresAt = updates.expiresAt;
    }

    if (updates.enabled !== undefined) {
        if (!user.card) user.card = {} as UserCard;
        user.card!.enabled = updates.enabled;
    }

    saveUsers();

    return { username: user.username, role: user.role, card: user.card, accountLimit: user.accountLimit || DEFAULT_ACCOUNT_LIMIT };
}

function editUser(oldUsername: string, updates: EditUpdates): EditResult {
    loadUsers();

    const user = users.find(u => u.username === oldUsername);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }

    if (updates.newUsername && updates.newUsername !== oldUsername) {
        if (!/^\w{3,32}$/.test(updates.newUsername)) {
            return { ok: false, error: '用户名只能包含字母、数字和下划线，长度3-32位' };
        }
        const existingUser = users.find(u => u.username === updates.newUsername);
        if (existingUser) {
            return { ok: false, error: '用户名已存在' };
        }
        user.username = updates.newUsername;
    }

    if (updates.password) {
        const passwordValidation = auth.validatePasswordStrength(updates.password);
        if (!passwordValidation.valid) {
            return { ok: false, error: passwordValidation.errors.join('；') };
        }
        user.password = auth.hashPassword(updates.password);
    }

    if (updates.accountLimit !== undefined) {
        user.accountLimit = Number.parseInt(String(updates.accountLimit), 10) || DEFAULT_ACCOUNT_LIMIT;
    }

    if (updates.isPermanent) {
        if (!user.card) user.card = {} as UserCard;
        user.card!.days = -1;
        user.card!.expiresAt = null;
    } else if (updates.expiresAt !== undefined) {
        if (!user.card) user.card = {} as UserCard;
        if (updates.expiresAt === null) {
            user.card!.days = 0;
            user.card!.expiresAt = null;
        } else {
            const now = Date.now();
            const expiresAt = Number.parseInt(String(updates.expiresAt), 10);
            user.card!.expiresAt = expiresAt;
            const diffMs = expiresAt - now;
            const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
            user.card!.days = diffDays > 0 ? diffDays : 0;
        }
    }

    saveUsers();

    return {
        ok: true,
        user: {
            username: user.username,
            role: user.role,
            card: user.card,
            accountLimit: user.accountLimit || DEFAULT_ACCOUNT_LIMIT
        }
    };
}

function getAllCards(): Card[] {
    loadCards();
    return cards;
}

function createCard(description: string, days: number, type: 'time' | 'quota' = 'time'): Card {
    loadCards();

    const newCard: Card = {
        code: generateCardCode(),
        description,
        days: Number.parseInt(String(days), 10) || 30,
        type: type === 'quota' ? 'quota' : 'time',
        enabled: true,
        usedBy: null,
        usedAt: null,
        createdAt: Date.now()
    };

    cards.push(newCard);
    saveCards();

    return newCard;
}

function createCardsBatch(description: string, days: number, count: number, type: 'time' | 'quota' = 'time'): Card[] {
    loadCards();

    const createdCards: Card[] = [];
    const daysNum = Number.parseInt(String(days), 10) || 30;
    const countNum = Math.min(Math.max(Number.parseInt(String(count), 10) || 1, 1), 100);
    const cardType = type === 'quota' ? 'quota' : 'time';

    for (let i = 0; i < countNum; i++) {
        const newCard: Card = {
            code: generateCardCode(),
            description,
            days: daysNum,
            type: cardType,
            enabled: true,
            usedBy: null,
            usedAt: null,
            createdAt: Date.now()
        };
        cards.push(newCard);
        createdCards.push(newCard);
    }

    saveCards();

    return createdCards;
}

function updateCard(code: string, updates: Partial<Pick<Card, 'description' | 'enabled'>>): Card | null {
    loadCards();
    const card = cards.find(c => c.code === code);
    if (!card) return null;

    if (updates.description !== undefined) {
        card.description = updates.description;
    }

    if (updates.enabled !== undefined) {
        card.enabled = updates.enabled;
    }

    saveCards();
    return card;
}

function deleteCard(code: string): boolean {
    loadCards();
    const idx = cards.findIndex(c => c.code === code);
    if (idx === -1) return false;

    cards.splice(idx, 1);
    saveCards();
    return true;
}

function deleteCardsBatch(codes: string[]): { ok: boolean; error?: string; deletedCount?: number; notFoundCount?: number; notFoundCodes?: string[] } {
    loadCards();
    if (!Array.isArray(codes) || codes.length === 0) {
        return { ok: false, error: '请提供要删除的卡密列表' };
    }

    let deletedCount = 0;
    const notFoundCodes: string[] = [];

    for (const code of codes) {
        const idx = cards.findIndex(c => c.code === code);
        if (idx !== -1) {
            cards.splice(idx, 1);
            deletedCount++;
        } else {
            notFoundCodes.push(code);
        }
    }

    saveCards();
    return {
        ok: true,
        deletedCount,
        notFoundCount: notFoundCodes.length,
        notFoundCodes: notFoundCodes.length > 0 ? notFoundCodes : undefined
    };
}

function deleteUser(username: string, forceDeleteAdmin: boolean = false): { ok: boolean; error?: string } {
    loadUsers();
    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) return { ok: false, error: '用户不存在' };

    if (!forceDeleteAdmin && users[idx].role === 'admin') {
        return { ok: false, error: '不能删除管理员账号' };
    }

    users.splice(idx, 1);
    saveUsers();
    return { ok: true };
}

function changePassword(username: string, oldPassword: string, newPassword: string): { ok: boolean; error?: string; message?: string } {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }

    if (!auth.verifyPassword(oldPassword, user.password)) {
        return { ok: false, error: '当前密码错误' };
    }

    const passwordValidation = auth.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
        return { ok: false, error: passwordValidation.errors.join('；') };
    }

    user.password = auth.hashPassword(newPassword);
    if (user.mustChangePassword) {
        delete user.mustChangePassword;
    }

    saveUsers();
    return { ok: true, message: '密码修改成功' };
}

function saveWxLoginConfig(username: string, config: Record<string, any>): { ok: boolean; error?: string; config?: Record<string, any> } {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }

    user.wxLoginConfig = {
        ...config,
        updatedAt: Date.now()
    };

    saveUsers();
    return { ok: true, config: user.wxLoginConfig };
}

function getWxLoginConfig(username: string): { ok: boolean; error?: string; config?: Record<string, any> | null } {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }

    return { ok: true, config: user.wxLoginConfig || null };
}

function getUserAccountLimit(username: string): number {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
        return DEFAULT_ACCOUNT_LIMIT;
    }
    return user.accountLimit || DEFAULT_ACCOUNT_LIMIT;
}

function canAddAccount(username: string): { canAdd: boolean; current: number; limit: number } {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
        return { canAdd: false, current: 0, limit: DEFAULT_ACCOUNT_LIMIT };
    }

    if (user.role === 'admin') {
        return { canAdd: true, current: 0, limit: -1 };
    }

    const limit = user.accountLimit || DEFAULT_ACCOUNT_LIMIT;
    return { canAdd: true, current: 0, limit };
}

module.exports = {
    loadUsers,
    saveUsers,
    loadCards,
    saveCards,
    initDefaultAdmin,
    validateUser,
    registerUser,
    renewUser,
    getAllUsers,
    updateUser,
    editUser,
    getAllCards,
    createCard,
    createCardsBatch,
    updateCard,
    deleteCard,
    deleteCardsBatch,
    deleteUser,
    changePassword,
    saveWxLoginConfig,
    getWxLoginConfig,
    getUserAccountLimit,
    canAddAccount,
    generateCardCode,
    DEFAULT_ACCOUNT_LIMIT,
};
