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
    replaceFriendsListCache,
} from './visit-strategy';

export {
    syncKnownFriendGidsFromFriends,
    syncKnownFriendGidsFromRecentVisitors,
    removeKnownFriendGid,
} from './gid-manager';

export {
    parseFriendOpenIds,
} from './open-id-validation';

export {
    syncFriendsByOpenIds,
} from './open-id-sync';
