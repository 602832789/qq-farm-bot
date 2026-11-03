export {};
export interface Account {
  id: string;
  name: string;
  code: string;
  platform: string;
  uin: string;
  qq: string;
  avatar: string;
  nick?: string;
  createdAt: number;
  updatedAt: number;
  /** 微信 openid，续期微信授权时必填。 */
  wxid?: string;
  /** 微信滚动凭证，用于免扫码续期。 */
  refreshtoken?: string;
  accesstoken?: string;
  /** 换取游戏登录 Code 的原始凭证。 */
  loginBuffer?: string;
  expires_in?: number;
  expires_at?: number;
  wxCredentialRefreshedAt?: number;
  wxCredentialLastAttemptAt?: number;
  wxCredentialRefreshError?: string;
}

export interface AccountsData {
  accounts: Account[];
  nextId: number;
}
