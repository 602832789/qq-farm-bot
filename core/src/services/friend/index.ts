/**
 * 好友模块 - 统一导出
 */

export {
    removeKnownFriendGid,
    syncKnownFriendGidsFromFriends,
    syncKnownFriendGidsFromRecentVisitors,
} from './gid-manager';

export {
    checkFriends,
    getOperationLimits,
    isHelpExpLimitReached,
    onFriendApplicationReceived,
    refreshFriendCheckLoop,
    startFriendCheckLoop,
    stopFriendCheckLoop,
} from './scheduler';

export {
    cacheFriendsListFromReply,
    clearFriendsListCache,
    deleteFriend,
    doFriendOperation,
    getFriendLandsDetail,
    getFriendsList,
    getFriendsListCacheOnly,
} from './visit-strategy';
