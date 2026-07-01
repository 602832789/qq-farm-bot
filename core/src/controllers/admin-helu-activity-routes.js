const {
  getAuthorizedAccountId,
  requireConnectedAccount,
} = require("./admin-activity-route-helpers");

function registerAdminHeluActivityRoutes({
  app,
  provider,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  const routeContext = {
    getAccountIdFromRequest,
    canAccessAccount,
  };

  app.get("/api/activity/helu", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "获取奇遇礼莲失败: 账号未运行"))
        return;

      const activity = await provider.getHeluActivity(accountId);
      res.json({
        ok: true,
        activity,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/helu/draw", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "奇遇礼莲抽奖失败: 账号未运行"))
        return;

      const result = await provider.drawHeluGiftLotus(accountId, req.body || {});
      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/helu/passport/claim", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "荷风游记领取失败: 账号未运行"))
        return;

      const result = await provider.claimSeasonPassportRewards(accountId);
      const activity = await provider.getHeluActivity(accountId);
      res.json({
        ok: true,
        ...result,
        activity,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/helu/solar/claim", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "节令小札领取失败: 账号未运行"))
        return;

      const termId = Number(req.body?.termId) || 0;
      const result = await provider.claimSolarTermsReward(accountId, termId);
      const activity = await provider.getHeluActivity(accountId);
      res.json({
        ok: true,
        ...result,
        activity,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/helu/exchange", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "荷露商店兑换失败: 账号未运行"))
        return;

      const slotId = Number(req.body?.slotId) || 0;
      const result = await provider.exchangeHeluShopItem(accountId, slotId);
      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/qingmei/claim", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "领取青梅种子失败: 账号未运行"))
        return;

      const result = await provider.claimQingmeiSeeds(accountId);
      const activity = await provider.getHeluActivity(accountId);
      res.json({
        ok: true,
        ...result,
        activity,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });
}

module.exports = { registerAdminHeluActivityRoutes };
