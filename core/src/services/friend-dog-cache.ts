/**
 * 好友当前上场宠物的跨账号共享缓存。
 * 狗的状态按 GID 保存，日同步完成后当天好友列表只读该文件，不再额外发起请求。
 */
const { getDataFile } = require('../config/runtime-paths');
const { readJsonFile, writeJsonFileAtomic } = require('./json-db');

const CACHE_FILE = getDataFile('friend-dogs.json');
const CACHE_VERSION = 1;

interface FriendDogCacheEntry {
    dogId: number;
    syncDate: string;
    checkedAt: number;
}

interface FriendDogCacheFile {
    version: number;
    friends: Record<string, FriendDogCacheEntry>;
}

let cache: FriendDogCacheFile | null = null;
const dirtyGids = new Set<string>();

function normalizeEntry(value: any): FriendDogCacheEntry | null {
    if (!value || typeof value !== 'object') return null;
    const dogId = Math.max(0, Number(value.dogId) || 0);
    const syncDate = String(value.syncDate || '').trim();
    const checkedAt = Math.max(0, Number(value.checkedAt) || 0);
    if (!syncDate && !checkedAt) return null;
    return { dogId, syncDate, checkedAt };
}

function normalizeFile(value: any): FriendDogCacheFile {
    const friends: Record<string, FriendDogCacheEntry> = {};
    const source = value && typeof value === 'object' && value.friends && typeof value.friends === 'object'
        ? value.friends
        : {};
    for (const [gid, raw] of Object.entries(source)) {
        if (!/^\d+$/.test(gid) || Number(gid) <= 0) continue;
        const entry = normalizeEntry(raw);
        if (entry) friends[gid] = entry;
    }
    return { version: CACHE_VERSION, friends };
}

function ensureLoaded(): FriendDogCacheFile {
    if (!cache) cache = normalizeFile(readJsonFile(CACHE_FILE, () => ({})));
    return cache;
}

function reloadFromDisk(): FriendDogCacheFile {
    return normalizeFile(readJsonFile(CACHE_FILE, () => ({})));
}

function reloadFriendDogCache(): void {
    cache = reloadFromDisk();
}

function getFriendDogCacheEntry(gidInput: unknown): FriendDogCacheEntry | null {
    const gid = Number(gidInput) || 0;
    if (gid <= 0) return null;
    return ensureLoaded().friends[String(gid)] || null;
}

function isFriendDogCacheReady(date: string, gids: number[] = []): boolean {
    const current = ensureLoaded();
    const target = String(date || '').trim();
    const targetGids = gids.map(Number).filter(gid => gid > 0);
    if (targetGids.length === 0) return false;
    return targetGids.every(gid => current.friends[String(gid)]?.syncDate === target);
}

function setFriendDogCacheEntry(gidInput: unknown, dogIdInput: unknown, syncDate = '', persist = false): void {
    const gid = Number(gidInput) || 0;
    if (gid <= 0) return;
    const current = getFriendDogCacheEntry(gid);
    ensureLoaded().friends[String(gid)] = {
        dogId: Math.max(0, Number(dogIdInput) || 0),
        syncDate: String(syncDate || current?.syncDate || '').trim(),
        checkedAt: Date.now(),
    };
    dirtyGids.add(String(gid));
}

function getFriendDogCacheEntries(): Record<string, FriendDogCacheEntry> {
    return { ...ensureLoaded().friends };
}

function isFriendDogSyncedOn(gidInput: unknown, date: string): boolean {
    const entry = getFriendDogCacheEntry(gidInput);
    return !!entry && entry.syncDate === String(date || '').trim();
}

function saveFriendDogCache(): void {
    const current = ensureLoaded();
    // 只合并本 worker 本次修改的 GID，避免多个账号并行写全局文件时互相覆盖。
    const disk = reloadFromDisk();
    for (const gid of dirtyGids) {
        const entry = current.friends[gid];
        if (entry) disk.friends[gid] = entry;
    }
    current.friends = disk.friends;
    current.version = CACHE_VERSION;
    writeJsonFileAtomic(CACHE_FILE, current, 2);
    dirtyGids.clear();
}

module.exports = {
    getFriendDogCacheEntry,
    reloadFriendDogCache,
    getFriendDogCacheEntries,
    setFriendDogCacheEntry,
    isFriendDogSyncedOn,
    isFriendDogCacheReady,
    saveFriendDogCache,
    FRIEND_DOG_CACHE_FILE: CACHE_FILE,
};
