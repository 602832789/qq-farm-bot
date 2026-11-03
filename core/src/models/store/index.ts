export {};
const globalConfig = require('./global-config');
const accountConfig = require('./account-config');
const accounts = require('./accounts');

module.exports = {
    // Account config
    getConfigSnapshot: accountConfig.getConfigSnapshot,
    applyConfigSnapshot: accountConfig.applyConfigSnapshot,
    getAutomation: accountConfig.getAutomation,
    setAutomation: accountConfig.setAutomation,
    isAutomationOn: accountConfig.isAutomationOn,
    getPreferredSeed: accountConfig.getPreferredSeed,
    getCapitalMode: accountConfig.getCapitalMode,
    setCapitalMode: accountConfig.setCapitalMode,
    getPlantingStrategy: accountConfig.getPlantingStrategy,
    getBagSeedPriority: accountConfig.getBagSeedPriority,
    getBagSeedMultiLandReservationEnabled: accountConfig.getBagSeedMultiLandReservationEnabled,
    getBagSeedLandTypes: accountConfig.getBagSeedLandTypes,
    getBagSeedFallbackStrategy: accountConfig.getBagSeedFallbackStrategy,
    getPrioritize2x2Crops: accountConfig.getPrioritize2x2Crops,
    getIntervals: accountConfig.getIntervals,
    getFriendQuietHours: accountConfig.getFriendQuietHours,
    getKnownFriendGids: accountConfig.getKnownFriendGids,
    setKnownFriendGids: accountConfig.setKnownFriendGids,
    getKnownFriendGidSyncCooldownSec: accountConfig.getKnownFriendGidSyncCooldownSec,
    setKnownFriendGidSyncCooldownSec: accountConfig.setKnownFriendGidSyncCooldownSec,
    getFriendsListCacheTtlSec: accountConfig.getFriendsListCacheTtlSec,
    setFriendsListCacheTtlSec: accountConfig.setFriendsListCacheTtlSec,
    getFriendBlacklist: accountConfig.getFriendBlacklist,
    setFriendBlacklist: accountConfig.setFriendBlacklist,
    addFriendToBlacklist: accountConfig.addFriendToBlacklist,
    getStealDelaySeconds: accountConfig.getStealDelaySeconds,
    getPlantOrderRandom: accountConfig.getPlantOrderRandom,
    getPlantDelaySeconds: accountConfig.getPlantDelaySeconds,
    getFertilizerBuyOrganicCount: accountConfig.getFertilizerBuyOrganicCount,
    getFertilizerBuyOrganicThresholdHours: accountConfig.getFertilizerBuyOrganicThresholdHours,
    getFertilizerBuyNormalCount: accountConfig.getFertilizerBuyNormalCount,
    getFertilizerBuyNormalThresholdHours: accountConfig.getFertilizerBuyNormalThresholdHours,
    getFertilizerBuyCheckIntervalMinutes: accountConfig.getFertilizerBuyCheckIntervalMinutes,
    getAutoAcceptFriendMinLevel: accountConfig.getAutoAcceptFriendMinLevel,
    getAutoAcceptRequireOwnLevel: accountConfig.getAutoAcceptRequireOwnLevel,
    getAutoAcceptHarvestStealEnabled: accountConfig.getAutoAcceptHarvestStealEnabled,
    getAutoAcceptHarvestStealHarvest: accountConfig.getAutoAcceptHarvestStealHarvest,
    getAutoAcceptHarvestStealSteal: accountConfig.getAutoAcceptHarvestStealSteal,
    getPlantBlacklist: accountConfig.getPlantBlacklist,
    setPlantBlacklist: accountConfig.setPlantBlacklist,
    getDefaultAccountConfig: accountConfig.getDefaultAccountConfig,

    // Global config
    getUI: globalConfig.getUI,
    setUITheme: globalConfig.setUITheme,
    getLoginSettings: globalConfig.getLoginSettings,
    setLoginSettings: globalConfig.setLoginSettings,
    getOfflineReminder: globalConfig.getOfflineReminder,
    setOfflineReminder: globalConfig.setOfflineReminder,

    // Accounts
    getAccounts: accounts.getAccounts,
    addOrUpdateAccount: accounts.addOrUpdateAccount,
    deleteAccount: accounts.deleteAccount,

    // System config
    getSystemConfig: globalConfig.getSystemConfig,
    setSystemConfig: globalConfig.setSystemConfig,
};
