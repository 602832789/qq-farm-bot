export {};
/**
 * 通用工具函数
 */
import type Long from 'long';

const LongModule = require('long');
const { createModuleLogger, sanitizeMeta } = require('../services/logger');
const coreLogger = createModuleLogger('core');

// ============ 服务器时间状态 ============
let serverTimeMs: number = 0;
let localTimeAtSync: number = 0;

// ============ 类型转换 ============
function toLong(val: number | Long): Long {
    return LongModule.fromNumber(val as number);
}

function toNum(val: Long | number | null | undefined): number {
    if (LongModule.isLong(val)) return (val as Long).toNumber();
    return (val as number) || 0;
}

// ============ 时间相关 ============

/** 获取当前推算的服务器时间(秒) */
function getServerTimeSec(): number {
    if (!serverTimeMs) return Math.floor(Date.now() / 1000);
    const elapsed = Date.now() - localTimeAtSync;
    return Math.floor((serverTimeMs + elapsed) / 1000);
}

/** 同步服务器时间 */
function syncServerTime(ms: number): void {
    serverTimeMs = ms;
    localTimeAtSync = Date.now();
}

/**
 * 将时间戳归一化为秒级
 * 大于 1e12 认为是毫秒级，转换为秒级
 */
function toTimeSec(val: Long | number | null | undefined): number {
    const n = toNum(val);
    if (n <= 0) return 0;
    if (n > 1e12) return Math.floor(n / 1000);
    return n;
}

// ============ 日志 ============
type LogHook = (tag: string, msg: string, isWarn: boolean, meta: Record<string, any>) => void;
let logHook: LogHook | null = null;
function setLogHook(hook: LogHook): void { logHook = hook; }

function normalizeMeta(meta: any): Record<string, any> {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
    return sanitizeMeta(meta);
}

function resolveModuleTag(moduleName: string): string {
    const moduleMap: Record<string, string> = {
        farm: '农场',
        friend: '好友',
        warehouse: '仓库',
        task: '任务',
        system: '系统',
    };
    const m = String(moduleName || '').trim();
    return moduleMap[m] || '系统';
}

function inferModuleFromTag(tag: string): string {
    const t = String(tag || '').trim();
    const tagMap: Record<string, string> = {
        农场: 'farm',
        商店: 'warehouse',
        购买: 'warehouse',
        仓库: 'warehouse',
        好友: 'friend',
        任务: 'task',
        活跃: 'task',
        系统: 'system',
        错误: 'system',
        WS: 'system',
        心跳: 'system',
        推送: 'system',
    };
    return tagMap[t] || 'system';
}

interface NormalizedLogArgs {
    tag: string;
    msg: string;
    meta: any;
}

function normalizeLogArgs(arg1: string, arg2: string | object | null, arg3?: any): NormalizedLogArgs {
    // 新写法: log(msg, meta)
    if (typeof arg2 !== 'string') {
        return {
            tag: '',
            msg: String(arg1 || ''),
            meta: arg2 || null,
        };
    }
    // 兼容旧写法: log(tag, msg, meta)
    return {
        tag: String(arg1 || ''),
        msg: String(arg2 || ''),
        meta: arg3 || null,
    };
}

function log(arg1: string, arg2: string | object | null, arg3: any = null): void {
    const { tag, msg, meta } = normalizeLogArgs(arg1, arg2, arg3);
    const safeMeta = normalizeMeta(meta);
    if (!safeMeta.module) safeMeta.module = inferModuleFromTag(tag);
    const displayTag = resolveModuleTag(safeMeta.module);
    coreLogger.info(msg, { tag: displayTag, ...safeMeta });
    if (logHook) {
        try { logHook(displayTag, msg, false, safeMeta); } catch {}
    }
}

function logWarn(arg1: string, arg2: string | object | null, arg3: any = null): void {
    const { tag, msg, meta } = normalizeLogArgs(arg1, arg2, arg3);
    const safeMeta = normalizeMeta(meta);
    if (!safeMeta.module) safeMeta.module = inferModuleFromTag(tag);
    const displayTag = resolveModuleTag(safeMeta.module);
    coreLogger.warn(msg, { tag: displayTag, ...safeMeta });
    if (logHook) {
        try { logHook(displayTag, msg, true, safeMeta); } catch {}
    }
}

// ============ 异步工具 ============
function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
    const min = Math.max(0, Math.floor(minMs) || 0);
    const max = Math.max(min, Math.floor(maxMs) || min);
    const delay = min + Math.floor(Math.random() * (max - min + 1));
    return new Promise(r => setTimeout(r, delay));
}

module.exports = {
    toLong, toNum,
    setLogHook,
    getServerTimeSec, syncServerTime, toTimeSec,
    log, logWarn, sleep, randomDelay,
};
