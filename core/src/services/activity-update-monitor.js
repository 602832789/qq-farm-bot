const fs = require('node:fs');
const { getDataFile } = require('../config/runtime-paths');
const { scanActivityUpdates } = require('./activity-update-scanner');

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const STATE_FILE = getDataFile('activity-update-report.json');

let timer = null;
let running = false;
let report = null;
let knownActivityIds = [];
let intervalMs = DEFAULT_INTERVAL_MS;
let nextScanAt = 0;

function readSavedReport() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeSavedReport(value) {
  try {
    fs.mkdirSync(require('node:path').dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, `${JSON.stringify(value, null, 2)}\n`);
  } catch (error) {
    console.warn(`[活动更新] 保存分析结果失败: ${error.message}`);
  }
}

function analyzeReport(scanned, previous) {
  const groups = new Map();
  for (const id of scanned.unknownActivityIds) {
    const date = String(id).slice(0, 8);
    const items = groups.get(date) || [];
    items.push(id);
    groups.set(date, items);
  }
  const previousVersion = previous?.source?.version || '';
  return {
    ...scanned,
    sourceChanged: !!previousVersion && previousVersion !== scanned.source?.version,
    previousSourceVersion: previousVersion || null,
    analysis: {
      candidateGroups: [...groups.entries()].map(([date, ids]) => ({ date, ids })),
      requiresProtocolSample: scanned.unknownActivityIds.length > 0,
      safeToAutoApply: false,
      summary: scanned.unknownActivityIds.length
        ? `发现 ${scanned.unknownActivityIds.length} 个候选活动 ID，已按活动日期归类，等待协议样本确认`
        : '未发现当前代码尚未登记的新活动 ID',
    },
  };
}

async function runActivityUpdateScan() {
  if (running) return report;
  running = true;
  try {
    const previous = report || readSavedReport();
    report = analyzeReport(scanActivityUpdates({ knownActivityIds }), previous);
    writeSavedReport(report);
    return report;
  } finally {
    running = false;
    nextScanAt = Date.now() + intervalMs;
  }
}

function scheduleNextScan() {
  if (timer) clearTimeout(timer);
  nextScanAt = Date.now() + intervalMs;
  timer = setTimeout(async () => {
    try {
      await runActivityUpdateScan();
    } catch (error) {
      console.warn(`[活动更新] 定时分析失败: ${error.message}`);
    } finally {
      scheduleNextScan();
    }
  }, intervalMs);
  timer.unref?.();
}

function startActivityUpdateMonitor(options = {}) {
  knownActivityIds = (options.knownActivityIds || []).map(Number);
  intervalMs = Math.max(MIN_INTERVAL_MS, Number(options.intervalMs) || Number(process.env.ACTIVITY_UPDATE_INTERVAL_MS) || DEFAULT_INTERVAL_MS);
  report = report || readSavedReport();
  scheduleNextScan();
  setImmediate(() => runActivityUpdateScan().catch(error => {
    console.warn(`[活动更新] 初始分析失败: ${error.message}`);
  }));
}

function getActivityUpdateState() {
  return {
    running,
    intervalMs,
    nextScanAt,
    report: report || readSavedReport(),
  };
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  analyzeReport,
  getActivityUpdateState,
  runActivityUpdateScan,
  startActivityUpdateMonitor,
};
