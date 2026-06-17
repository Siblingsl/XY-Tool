/**
 * ============================================================
 * 闲鱼协议层接口契约
 * ============================================================
 * 这是整个项目最关键的抽象层。业务模块只依赖这些接口，
 * 不依赖具体的签名实现或 HTTP 调用细节。
 *
 * 设计目标：签名算法（mtop 的 x-sign/x-mini-wua/x-sgext）
 * 阿里会定期更新，必须能"换实现而不动业务代码"。
 * 因此把签名能力抽象为 ISignProvider，可插拔切换。
 * ============================================================
 */

/**
 * 签名输入：待签名的请求信息。
 * mtop 签名通常需要 appKey、token、时间戳、请求参数、ua 等。
 */
export interface SignInput {
  /** mtop 接口名，如 mtop.taobao.idle.trade.order.list */
  apiName: string;
  /** mtop 协议版本，通常是 '1.0' */
  version: string;
  /** 请求时间戳（毫秒） */
  timestamp: number;
  /** appKey（闲鱼 App 的 appKey） */
  appKey: string;
  /** 用户登录 token（来自 cookie _m_h5_tk 的前半段） */
  token: string;
  /** 请求参数（业务 data 对象） */
  data: Record<string, unknown>;
  /** 设备/UA 信息（影响 x-sgext 等设备签名） */
  userAgent?: string;
}

/**
 * 签名输出：mtop 请求头需要的签名字段。
 * 这些值会被 mtop-client 放到请求头/query 中发送给阿里服务器。
 */
export interface SignOutput {
  /** x-sign: 主签名（HMAC 系） */
  xSign: string;
  /** x-mini-wua: 阿里风控字段 */
  xMiniWua: string;
  /** x-sgext: 设备行为扩展字段（base64 编码的数组） */
  xSgext: string;
  /** x-sign 方法版本标识，如 "v2.0" */
  xSignMethod?: string;
}

/**
 * 签名服务提供者接口（核心抽象）。
 *
 * 三种实现：
 * 1. MockSignProvider    - 开发用，返回假签名，不校验真实性
 * 2. HttpSignProvider    - 接第三方签名 API（市面有偿服务）
 * 3. NativeSignProvider  - 调用自研 so 库（本地/内网签名服务）
 * 4. GoofishSignProvider - PC 端 goofish.com MD5 签名（与 goofish-sdk 一致）
 *
 * 通过 SIGN_PROVIDER 环境变量切换，业务层无感知。
 */
export interface ISignProvider {
  /** 对输入请求进行签名 */
  sign(input: SignInput): Promise<SignOutput>;

  /** 健康检查（用于监控、启动自检） */
  health(): Promise<boolean>;

  /** 提供者名称（日志/监控用） */
  readonly name: string;
}

/**
 * mtop 请求上下文：发起一次 mtop 调用所需的全部信息。
 * mtop-client 据此构造请求并调用 ISignProvider 签名。
 */
export interface MtopRequestContext {
  /** 调用的闲鱼账号 cookie（含 _m_h5_tk 等，用于鉴权） */
  cookie: string;
  /** appKey */
  appKey: string;
  /** 设备 UA */
  userAgent: string;
}

/**
 * mtop 响应。mtop 网关固定返回 { api, data, ret, v } 结构。
 * ret[0] 形如 "SUCCESS::调用成功"，以 "SUCCESS::" 开头表示成功。
 */
export interface MtopResponse<T = unknown> {
  api: string;
  v: string;
  ret: string[];
  data: T;
}

/** 判断 mtop 响应是否成功 */
export function isMtopSuccess(res: MtopResponse): boolean {
  return Array.isArray(res.ret) && res.ret.some((r) => r.startsWith('SUCCESS::'));
}

// ============ 依赖注入 Token ============
/** ISignProvider 的 DI Token（用接口做 Token，避免循环依赖） */
export const SIGN_PROVIDER = Symbol('SIGN_PROVIDER');
