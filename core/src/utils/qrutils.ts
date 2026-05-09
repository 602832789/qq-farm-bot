export {};
/**
 * QR Login Utilities
 */

class CookieUtils {
    static getValue(cookies: string | string[] | null | undefined, key: string): string | null {
        if (!cookies) return null;
        if (Array.isArray(cookies)) cookies = cookies.join('; ');
        const match = cookies.match(new RegExp(`(^|;\\s*)${key}=([^;]*)`));
        return match ? match[2] : null;
    }

    static getUin(cookies: string | string[] | null | undefined): string | null {
        const uin = this.getValue(cookies, 'wxuin') || this.getValue(cookies, 'uin') || this.getValue(cookies, 'ptui_loginuin');
        if (!uin) return null;
        return uin.replace(/^o0*/, '');
    }
}

class HashUtils {
    static hash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash += (hash << 5) + str.charCodeAt(i);
        }
        return 2147483647 & hash;
    }

}

module.exports = { CookieUtils, HashUtils };
