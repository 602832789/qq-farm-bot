export {};
import type { Account, AccountsData } from '../../types/account';

const fs = require('node:fs');
const { ensureDataDir } = require('../../config/runtime-paths');
const { readJsonFile, writeJsonFileAtomic } = require('../../services/json-db');

const { ACCOUNTS_FILE } = require('./shared-state');

function loadAccounts(): AccountsData {
    ensureDataDir();
    const data = readJsonFile(ACCOUNTS_FILE, () => ({ accounts: [], nextId: 1 }));
    return normalizeAccountsData(data);
}

function saveAccounts(data: AccountsData): void {
    ensureDataDir();
    writeJsonFileAtomic(ACCOUNTS_FILE, normalizeAccountsData(data));
}

function getAccounts(): AccountsData {
    return loadAccounts();
}

function normalizeAccountsData(raw: unknown): AccountsData {
    const data: any = raw && typeof raw === 'object' ? raw : {};
    const accounts: Account[] = Array.isArray(data.accounts) ? data.accounts : [];
    const maxId = accounts.reduce((m: number, a: any) => Math.max(m, Number.parseInt(a && a.id, 10) || 0), 0);
    let nextId = Number.parseInt(data.nextId, 10);
    if (!Number.isFinite(nextId) || nextId <= 0) nextId = maxId + 1;
    if (accounts.length === 0) nextId = 1;
    if (nextId <= maxId) nextId = maxId + 1;
    return { accounts, nextId };
}

function addOrUpdateAccount(acc: Partial<Account> & { avatarUrl?: string }): AccountsData {
    const { ensureAccountConfig, removeAccountConfig } = require('./account-config');
    const data = normalizeAccountsData(loadAccounts());
    let touchedAccountId = '';
    if (acc.id) {
        const idx = data.accounts.findIndex(a => a.id === acc.id);
        if (idx >= 0) {
            data.accounts[idx] = { ...data.accounts[idx], ...acc, name: acc.name !== undefined ? acc.name : data.accounts[idx].name, updatedAt: Date.now() };
            touchedAccountId = String(data.accounts[idx].id || '');
        }
    } else {
        const id = data.nextId++;
        touchedAccountId = String(id);
        data.accounts.push({
            id: touchedAccountId,
            name: acc.name || `账号${id}`,
            code: acc.code || '',
            platform: acc.platform || 'qq',
            uin: acc.uin ? String(acc.uin) : '',
            qq: acc.qq ? String(acc.qq) : (acc.uin ? String(acc.uin) : ''),
            avatar: acc.avatar || acc.avatarUrl || '',
            username: acc.username || '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }
    saveAccounts(data);
    if (touchedAccountId) {
        ensureAccountConfig(touchedAccountId);
    }
    return data;
}

function deleteAccount(id: unknown): AccountsData {
    const { removeAccountConfig } = require('./account-config');
    const data = normalizeAccountsData(loadAccounts());
    data.accounts = data.accounts.filter(a => a.id !== String(id));
    if (data.accounts.length === 0) {
        data.nextId = 1;
    }
    saveAccounts(data);
    removeAccountConfig(id);
    return data;
}

function getAccountsByUser(username: string): AccountsData {
    const allAccounts = loadAccounts();
    if (!username) return allAccounts;
    return {
        accounts: allAccounts.accounts.filter(a => a.username === username),
        nextId: allAccounts.nextId
    };
}

function deleteAccountsByUser(username: string): { deletedCount: number; deletedIds: string[] } {
    const { removeAccountConfig } = require('./account-config');
    const data = loadAccounts();
    const deletedIds: string[] = [];
    data.accounts = data.accounts.filter(a => {
        if (a.username === username) {
            deletedIds.push(a.id);
            return false;
        }
        return true;
    });
    if (data.accounts.length === 0) {
        data.nextId = 1;
    }
    saveAccounts(data);
    deletedIds.forEach(id => removeAccountConfig(id));
    return { deletedCount: deletedIds.length, deletedIds };
}

function deleteUserConfig(username: string): void {
    const { deleteUserOfflineReminder } = require('./global-config');
    deleteUserOfflineReminder(username);
}

module.exports = {
    loadAccounts,
    saveAccounts,
    getAccounts,
    normalizeAccountsData,
    addOrUpdateAccount,
    deleteAccount,
    getAccountsByUser,
    deleteAccountsByUser,
    deleteUserConfig,
};
