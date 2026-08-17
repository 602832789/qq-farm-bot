const activity = require('../services/activity');
const {
  getActivityUpdateState,
  runActivityUpdateScan,
  startActivityUpdateMonitor,
} = require('../services/activity-update-monitor');

function registerAdminActivityUpdateRoutes({ app, requireAdminToken }) {
  const knownActivityIds = Object.entries(activity)
    .filter(([key, value]) => key.endsWith('_ACTIVITY_ID') && Number.isFinite(Number(value)))
    .map(([, value]) => Number(value));
  startActivityUpdateMonitor({ knownActivityIds });

  app.get('/api/activity/update/status', requireAdminToken, (req, res) => {
    res.json({ ok: true, ...getActivityUpdateState() });
  });

  app.post('/api/activity/update/scan', requireAdminToken, async (req, res) => {
    try {
      const report = await runActivityUpdateScan();
      res.json({ ok: true, report, ...getActivityUpdateState() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || '活动更新扫描失败' });
    }
  });
}

module.exports = { registerAdminActivityUpdateRoutes };
