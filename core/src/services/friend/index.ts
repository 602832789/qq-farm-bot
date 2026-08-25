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
    clearFriendsListCache,
    cacheFriendsListFromReply,
    deleteFriend,
    doFriendOperation,
    getFriendLandsDetail,
    getFriendsList,
    getFriendsListCacheOnly,
    syncOneFriendDog,
    syncAllFriendDogsDaily,
} from './visit-strategy';
