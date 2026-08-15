/**
 * Optional QQ friend synchronization using OpenIDs supplied by an authenticated client.
 * OpenIDs are validated in memory and are never persisted or logged here.
 */

import { parseFriendOpenIds } from './open-id-validation';

const { CONFIG } = require('../../config/config');
const { sendMsgAsync } = require('../../utils/network');
const { types } = require('../../utils/proto');
const {
    dedupeFriendsByGid,
    extractReplyFriends,
    syncKnownFriendGidsFromFriends,
} = require('./gid-manager');
const { replaceFriendsListCache } = require('./visit-strategy');

export async function syncFriendsByOpenIds(value: unknown): Promise<{
    receivedCount: number;
    friendCount: number;
    cacheUpdated: boolean;
    cachedCount: number;
    knownFriendGidCount: number;
}> {
    const parsed = parseFriendOpenIds(value);
    if (parsed.ok === false) throw new Error(parsed.error);
    if (CONFIG.platform !== 'qq') throw new Error('OpenID 好友同步仅支持 QQ 平台账号');

    const RequestType: any = types.SyncAllRequest || types.SyncAllFriendsRequest;
    const ReplyType: any = types.SyncAllReply || types.SyncAllFriendsReply;
    if (!RequestType || !ReplyType) throw new Error('SyncAll 接口类型未加载');

    const body: Uint8Array = RequestType.encode(RequestType.create({
        open_ids: parsed.openIds,
    })).finish();
    const { body: replyBody } = await sendMsgAsync(
        'gamepb.friendpb.FriendService',
        'SyncAll',
        body,
    );
    const friends: any[] = dedupeFriendsByGid(extractReplyFriends(ReplyType.decode(replyBody)));
    const knownFriendGids: number[] = syncKnownFriendGidsFromFriends(friends);
    const cachedFriends: any[] = replaceFriendsListCache(friends);

    return {
        receivedCount: parsed.openIds.length,
        friendCount: friends.length,
        cacheUpdated: true,
        cachedCount: cachedFriends.length,
        knownFriendGidCount: knownFriendGids.length,
    };
}

export { parseFriendOpenIds } from './open-id-validation';
