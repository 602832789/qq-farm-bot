export {};
const fs = require('node:fs');
const crypto = require('node:crypto');
const { getDataFile, ensureDataDir } = require('../../config/runtime-paths');

const users = require('./users');

const CARD_CLAIM_FILE: string = getDataFile('card-claim.json');

interface CardClaimRecord {
    uaHash: string;
    claimTime: number;
    cardCode: string;
    username: string | null;
}

interface UAClaimCheckResult {
    allowed: boolean;
    remainingMs?: number;
    message?: string;
}

interface ClaimResult {
    ok: boolean;
    error?: string;
    remainingMs?: number;
    cardCode?: string;
    days?: number;
    description?: string;
}

let cardClaimEnabled: boolean = false;
let cardClaimRecords: CardClaimRecord[] = [];

function loadCardClaimRecords(): void {
    ensureDataDir();
    try {
        if (fs.existsSync(CARD_CLAIM_FILE)) {
            const data = JSON.parse(fs.readFileSync(CARD_CLAIM_FILE, 'utf8'));
            cardClaimEnabled = data.enabled === true;
            cardClaimRecords = data.records || [];
        } else {
            cardClaimEnabled = true;
            cardClaimRecords = [];
            saveCardClaimRecords();
        }
    } catch (e) {
        cardClaimEnabled = true;
        cardClaimRecords = [];
    }
}

function saveCardClaimRecords(): void {
    ensureDataDir();
    try {
        fs.writeFileSync(CARD_CLAIM_FILE, JSON.stringify({
            enabled: cardClaimEnabled,
            records: cardClaimRecords
        }, null, 2), 'utf8');
    } catch (e) {
        // console.error('保存卡密领取记录失败:', e.message);
    }
}

function getCardClaimStatus(): { enabled: boolean } {
    loadCardClaimRecords();
    return { enabled: cardClaimEnabled };
}

function setCardClaimStatus(enabled: boolean): { enabled: boolean } {
    loadCardClaimRecords();
    cardClaimEnabled = !!enabled;
    saveCardClaimRecords();
    return { enabled: cardClaimEnabled };
}

function checkUAClaimLimit(ua: string): UAClaimCheckResult {
    loadCardClaimRecords();
    const now = Date.now();
    const uaHash = crypto.createHash('sha256').update(ua).digest('hex');

    const record = cardClaimRecords.find(r => r.uaHash === uaHash);
    if (record) {
        const elapsed = now - record.claimTime;
        if (elapsed < 24 * 60 * 60 * 1000) {
            const remainingMs = 24 * 60 * 60 * 1000 - elapsed;
            return {
                allowed: false,
                remainingMs,
                message: '您已经在24小时内领取过一次卡密了！'
            };
        }
    }

    return { allowed: true };
}

function claimCardByUA(ua: string, username: string | null = null): ClaimResult {
    users.loadCards();
    loadCardClaimRecords();

    if (!cardClaimEnabled) {
        return { ok: false, error: '卡密领取功能未开启' };
    }

    const uaCheck = checkUAClaimLimit(ua);
    if (!uaCheck.allowed) {
        return { ok: false, error: uaCheck.message, remainingMs: uaCheck.remainingMs };
    }

    const allCards = users.getAllCards();
    const unusedTimeCards = allCards.filter((c: any) =>
        c.type === 'time'
        && !c.usedBy
        && c.enabled
    );

    if (unusedTimeCards.length === 0) {
        return { ok: false, error: '卡密库存不足，请联系管理员！' };
    }

    const randomIndex = Math.floor(Math.random() * unusedTimeCards.length);
    const selectedCard = unusedTimeCards[randomIndex];

    const uaHash = crypto.createHash('sha256').update(ua).digest('hex');
    cardClaimRecords.push({
        uaHash,
        claimTime: Date.now(),
        cardCode: selectedCard.code,
        username: username || null
    });

    saveCardClaimRecords();

    return {
        ok: true,
        cardCode: selectedCard.code,
        days: selectedCard.days,
        description: selectedCard.description
    };
}

function getCardClaimRecords(): CardClaimRecord[] {
    loadCardClaimRecords();
    return cardClaimRecords;
}

function clearExpiredClaimRecords(): { cleared: number } {
    loadCardClaimRecords();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const beforeCount = cardClaimRecords.length;
    cardClaimRecords = cardClaimRecords.filter(r =>
        now - r.claimTime < oneDayMs
    );

    if (cardClaimRecords.length !== beforeCount) {
        saveCardClaimRecords();
    }

    return { cleared: beforeCount - cardClaimRecords.length };
}

module.exports = {
    getCardClaimStatus,
    setCardClaimStatus,
    claimCardByUA,
    getCardClaimRecords,
    clearExpiredClaimRecords,
};
