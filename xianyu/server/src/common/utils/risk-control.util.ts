/**
 * 账号级风控工具。
 *
 * 闲鱼对高频 IM/mtop 请求很敏感，此模块提供：
 * 1. 账号级串行锁（同一账号请求排队）
 * 2. 最小请求间隔 + 随机抖动（模拟真人节奏）
 * 3. 发货冷却（同一订单冷却期内不重复处理）
 * 4. 简单令牌桶式滑动窗口限速
 *
 * 仅进程内生效；多实例部署时需改用 Redis，但单机 SaaS 足够。
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** [min, max] 区间随机整数 */
export function randomInt(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/** 在 base 上叠加 ±jitter 比例的抖动 */
export function withJitter(baseMs: number, jitterRatio = 0.3): number {
  const delta = baseMs * jitterRatio;
  return Math.max(0, Math.round(baseMs - delta + Math.random() * delta * 2));
}

/**
 * 账号级请求节流器。
 * - withAccountLock: 同一账号串行
 * - waitTurn: 保证两次请求之间至少 minIntervalMs（带抖动）
 */
export class AccountRiskGuard {
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly lastActionAt = new Map<string, number>();
  /** 滑动窗口：key -> 时间戳列表 */
  private readonly windows = new Map<string, number[]>();
  /** 订单发货冷却：orderKey -> 上次发货时间 */
  private readonly deliveryCooldown = new Map<string, number>();
  constructor(
    private readonly options: {
      /** 同账号两次动作最小间隔（毫秒） */
      minIntervalMs?: number;
      /** 抖动比例 0~1 */
      jitterRatio?: number;
      /** 滑动窗口时长（毫秒） */
      windowMs?: number;
      /** 窗口内最大请求数 */
      maxPerWindow?: number;
      /** 订单发货冷却（毫秒），默认 2 分钟 */
      deliveryCooldownMs?: number;
    } = {},
  ) {}

  private get minIntervalMs() {
    return this.options.minIntervalMs ?? 500;
  }
  private get jitterRatio() {
    return this.options.jitterRatio ?? 0.2;
  }
  private get windowMs() {
    return this.options.windowMs ?? 60_000;
  }
  private get maxPerWindow() {
    return this.options.maxPerWindow ?? 60;
  }
  private get deliveryCooldownMs() {
    return this.options.deliveryCooldownMs ?? 120_000;
  }

  /** 已取消冷静期：始终不暂停（兼容旧调用） */
  isCaptchaPaused(_accountKey: string | number): boolean {
    return false;
  }

  /** 已取消冷静期：空操作，返回当前时间 */
  markCaptchaHit(_accountKey: string | number, _pauseMs?: number): number {
    return Date.now();
  }

  captchaPauseRemainingMs(_accountKey: string | number): number {
    return 0;
  }

  clearCaptchaPause(_accountKey: string | number): void {
    /* no-op */
  }

  /** 同一账号串行执行 */
  async withAccountLock<T>(accountKey: string | number, fn: () => Promise<T>): Promise<T> {
    const key = String(accountKey);
    const prev = this.locks.get(key);
    if (prev) {
      try {
        await prev;
      } catch {
        /* 前一个任务失败也继续 */
      }
    }

    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    this.locks.set(key, gate);

    try {
      await this.waitTurn(key);
      await this.consumeRate(key);
      return await fn();
    } finally {
      resolve();
      if (this.locks.get(key) === gate) {
        this.locks.delete(key);
      }
    }
  }

  /** 等待到满足最小间隔（含抖动） */
  async waitTurn(accountKey: string | number): Promise<void> {
    const key = String(accountKey);
    const last = this.lastActionAt.get(key) ?? 0;
    const minGap = withJitter(this.minIntervalMs, this.jitterRatio);
    const wait = last + minGap - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    this.lastActionAt.set(key, Date.now());
  }

  /** 滑动窗口限速；超限则等待到窗口腾出空位 */
  async consumeRate(accountKey: string | number): Promise<void> {
    const key = String(accountKey);
    for (;;) {
      const now = Date.now();
      const list = (this.windows.get(key) ?? []).filter((t) => now - t < this.windowMs);
      if (list.length < this.maxPerWindow) {
        list.push(now);
        this.windows.set(key, list);
        return;
      }
      const oldest = list[0];
      const wait = this.windowMs - (now - oldest) + randomInt(50, 300);
      await sleep(Math.max(wait, 100));
    }
  }

  /** 发货前随机思考延迟（模拟人工打开订单再发货） */
  async humanDeliveryDelay(minMs = 800, maxMs = 2500): Promise<void> {
    await sleep(randomInt(minMs, maxMs));
  }

  /** 多卡密间隔发送延迟 */
  async multiItemGap(): Promise<void> {
    await sleep(randomInt(900, 1600));
  }

  /**
   * 检查订单是否在发货冷却期。
   * @returns true 表示可以发货
   */
  canDeliverOrder(orderKey: string | number): boolean {
    const key = String(orderKey);
    const last = this.deliveryCooldown.get(key);
    if (!last) return true;
    return Date.now() - last >= this.deliveryCooldownMs;
  }

  markDelivered(orderKey: string | number): void {
    this.deliveryCooldown.set(String(orderKey), Date.now());
    // 惰性清理：超过 1000 条时清掉过期
    if (this.deliveryCooldown.size > 1000) {
      const now = Date.now();
      for (const [k, t] of this.deliveryCooldown) {
        if (now - t > this.deliveryCooldownMs * 2) {
          this.deliveryCooldown.delete(k);
        }
      }
    }
  }

  /** 延时发货：按配置秒数 + 小抖动 */
  async delayDeliverySeconds(seconds: number): Promise<void> {
    if (!seconds || seconds <= 0) return;
    const ms = withJitter(seconds * 1000, 0.1);
    await sleep(ms);
  }
}

/** 全局单例：仅轻量节流，不做滑块冷静期 */
export const globalRiskGuard = new AccountRiskGuard({
  minIntervalMs: 400,
  jitterRatio: 0.15,
  windowMs: 60_000,
  maxPerWindow: 80,
  deliveryCooldownMs: 60_000,
});
