/**
 * 好友模块 - 统一导出
 */

export {
    checkFriends,
    startFriendCheckLoop,
    stopFriendCheckLoop,
    refreshFriendCheckLoop,
    isHelpExpLimitReached,
    onFriendApplicationReceived,
    runBadOnceOnStartup,
    getOperationLimits,
} from './scheduler';

export {
    getFriendsList,
    getFriendLandsDetail,
    doFriendOperation,
    clearFriendsListCache,
} from './visit-strategy';

export {
    syncKnownFriendGidsFromFriends,
    syncKnownFriendGidsFromRecentVisitors,
    removeKnownFriendGid,
} from './gid-manager';
