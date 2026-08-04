export {};
/**
 * 主程序 - 进程管理器
 * 负责启动 Web 面板，并管理多个 Bot 子进程
 */
const path = require('node:path');
const fs = require('node:fs');

function loadEnvFile(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
        const line = rawLine.trim();
        const separator = line.indexOf('=');
        if (!line || line.startsWith('#') || separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        if (!key || process.env[key] !== undefined) continue;
        const value = line.slice(separator + 1).trim();
        process.env[key] = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
            ? value.slice(1, -1)
            : value;
    }
}

loadEnvFile(path.resolve(__dirname, '..', '.env'));

// Detect if running compiled (dist/) or source (tsx)
const distDir = path.join(__dirname, 'dist');
const baseDir = fs.existsSync(distDir) ? './dist' : './src';

const {
    startAdminServer,
    emitRealtimeStatus,
    emitRealtimeLog,
    emitRealtimeAccountLog,
} = require(`${baseDir}/controllers/admin`);
const { createRuntimeEngine } = require(`${baseDir}/runtime/runtime-engine`);
const { createModuleLogger } = require(`${baseDir}/services/logger`);
const mainLogger = createModuleLogger('main');

// 打包后 worker 由当前可执行文件以 --worker 模式启动
const isWorkerProcess: boolean = process.env.FARM_WORKER === '1';
if (isWorkerProcess) {
    require(`${baseDir}/core/worker`);
} else {
    const runtimeEngine = createRuntimeEngine({
        processRef: process,
        mainEntryPath: __filename,
        startAdminServer,
        onStatusSync: (accountId: string, status: any) => {
            emitRealtimeStatus(accountId, status);
        },
        onLog: (entry: any, accountId?: string) => {
            // 确保日志条目包含 accountId
            if (accountId && entry) {
                entry.accountId = accountId;
            }
            emitRealtimeLog(entry);
        },
        onAccountLog: (entry: any) => {
            emitRealtimeAccountLog(entry);
        },
    });

    runtimeEngine.start({
        startAdminServer: true,
        autoStartAccounts: false,
    }).catch((err: any) => {
        mainLogger.error('runtime bootstrap failed', { error: err && err.message ? err.message : String(err) });
    });
}
