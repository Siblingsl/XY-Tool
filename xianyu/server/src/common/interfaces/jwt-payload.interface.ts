/**
 * JWT Payload 中携带的用户信息。
 * 登录时签发，每次请求从 token 中解析。
 * tenantId 是多租户隔离的关键，业务层据此过滤数据。
 */
export interface JwtPayload {
  /** 用户ID（users.id） */
  sub: number;
  /** 用户名 */
  username: string;
  /** 租户ID（数据隔离用） */
  tenantId: number;
  /** 角色 */
  role: string;
  /**
   * Token 类型：
   * - access: 业务接口鉴权用（短效）
   * - refresh: 换取 access token 用（长效），不可直接访问业务接口
   */
  type?: 'access' | 'refresh';
}
