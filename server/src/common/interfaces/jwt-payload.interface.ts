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
}
