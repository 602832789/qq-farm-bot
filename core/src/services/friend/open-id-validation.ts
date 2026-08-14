const MAX_FRIEND_OPEN_IDS: number = 200;
const MAX_FRIEND_OPEN_ID_LENGTH: number = 128;

type ParseFriendOpenIdsResult =
    | { ok: true; openIds: string[] }
    | { ok: false; error: string };

export function parseFriendOpenIds(value: unknown): ParseFriendOpenIdsResult {
    if (!Array.isArray(value) || value.length === 0) {
        return { ok: false, error: 'OpenID 列表不能为空' };
    }
    if (value.length > MAX_FRIEND_OPEN_IDS) {
        return { ok: false, error: `OpenID 数量不能超过 ${MAX_FRIEND_OPEN_IDS}` };
    }

    const openIds: string[] = [];
    const seen: Set<string> = new Set();
    for (const item of value) {
        if (typeof item !== 'string') {
            return { ok: false, error: 'OpenID 必须是字符串' };
        }
        const openId = item.trim();
        if (
            openId.length === 0
            || openId.length > MAX_FRIEND_OPEN_ID_LENGTH
            || Array.from(openId).some((character) => {
                const codePoint = character.codePointAt(0) || 0;
                return codePoint < 32 || codePoint === 127;
            })
        ) {
            return { ok: false, error: `OpenID 长度必须在 1 到 ${MAX_FRIEND_OPEN_ID_LENGTH} 之间且不能包含控制字符` };
        }
        if (!seen.has(openId)) {
            seen.add(openId);
            openIds.push(openId);
        }
    }

    return { ok: true, openIds };
}
