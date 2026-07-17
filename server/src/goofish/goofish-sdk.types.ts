/** goofish-sdk.js 导出的 MTOP 响应结构 */
export interface GoofishMtopRawResponse<T = unknown> {
  api?: string;
  v?: string;
  ret?: string[];
  data?: T;
}

/** goofish-sdk.js 模块类型（CommonJS） */
export interface GoofishSdkModule {
  APP_KEY: string;
  IM_APP_KEY: string;
  MTOP_BASE: string;
  WS_URL: string;
  UA: string;
  MTOP_HEADERS: Record<string, string>;
  GoofishClient: new (
    cookies: string | Record<string, string>,
    options?: { deviceId?: string },
  ) => GoofishClientInstance;
  GoofishRiskControl: new (options?: {
    sdkDir?: string;
    withTfstk?: boolean;
  }) => GoofishRiskControlInstance;
  generateSign: (t: string, token: string, data: string) => string;
  generateMid: () => string;
  generateUuid: () => string;
  generateDeviceId: (userId: string) => string;
  decrypt: (raw: string) => string;
  decryptObject: (raw: string) => Record<string, unknown>;
  parseWsPushMessage: (wsBody: unknown) => {
    cid: string;
    senderUserId: string;
    senderUserName: string;
    content: string;
    raw: unknown;
  } | null;
  buildSendMessage: (opts: {
    cid: string;
    toUserId: string;
    myUserId: string;
    text?: string;
    imageUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
  }) => Record<string, unknown>;
  buildWsAck: (incoming: { headers?: Record<string, unknown> }) => Record<string, unknown>;
  buildWsReg: (accessToken: string, deviceId: string) => Record<string, unknown>;
  buildWsHeartbeat: () => Record<string, unknown>;
  buildSyncAck: () => Record<string, unknown>;
  parseCookies: (s: string) => Record<string, string>;
  cookiesToString: (c: Record<string, string>) => string;
}

export interface GoofishClientInstance {
  userId: string;
  deviceId: string;
  getCookieString(): string;
  mtopPost(
    api: string,
    data: Record<string, unknown> | string,
    extraParams?: Record<string, unknown>,
  ): Promise<GoofishMtopRawResponse>;
  getToken(): Promise<GoofishMtopRawResponse<{ accessToken?: string }>>;
  refreshToken(): Promise<GoofishMtopRawResponse>;
  getItemInfo(itemId: string): Promise<GoofishMtopRawResponse>;
  uploadMedia?(
    filePathOrBuffer: string | Buffer,
    filename?: string,
  ): Promise<GoofishMtopRawResponse & { object?: { url?: string; pix?: string } }>;
  /** 正式上架（业务层勿直接暴露） */
  publishItem?(opts: Record<string, unknown>): Promise<GoofishMtopRawResponse>;
  /** 仅保存闲鱼草稿（不上架） */
  saveItemDraft?(opts: Record<string, unknown>): Promise<GoofishMtopRawResponse>;
}

export interface GoofishRiskControlInstance {
  buildInitialCookies(): Promise<Record<string, string>>;
  generateTfstk(timeoutMs?: number): string;
}
