import { Injectable, Logger } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/**
 * 实时推送服务。
 *
 * 封装 WS 广播逻辑，供业务模块调用。
 * 业务模块只需注入此服务，调用 push 方法即可，无需关心 WS 协议细节。
 *
 * 事件约定:
 * - order:created   新订单入库
 * - order:status    订单状态变化（DELIVERED / FAILED / ASSIGNED 等）
 * - delivery:result 发货日志写入（success / failed）
 * - kami:lowstock   卡密池低库存告警
 * - account:expired 闲鱼账号 Cookie 过期
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private gateway: RealtimeGateway | null = null;

  setServer(gateway: RealtimeGateway): void {
    this.gateway = gateway;
  }

  /** 向指定租户推送事件 */
  pushToTenant(tenantId: number, event: string, data: unknown): void {
    if (!this.gateway) {
      this.logger.debug(`WS 网关未就绪，跳过推送 ${event} tenant=${tenantId}`);
      return;
    }
    try {
      this.gateway.emitToTenant(tenantId, event, data);
    } catch (err) {
      this.logger.debug(`WS 推送失败 ${event}: ${(err as Error).message}`);
    }
  }

  // ============ 便捷方法 ============

  pushOrderCreated(tenantId: number, order: { bizOrderId: string; itemTitle: string }) {
    this.pushToTenant(tenantId, 'order:created', order);
  }

  pushOrderStatus(tenantId: number, order: { bizOrderId: string; status: string }) {
    this.pushToTenant(tenantId, 'order:status', order);
  }

  pushDeliveryResult(
    tenantId: number,
    log: { orderId: number; result: string; deliveryType: string; durationMs: number },
  ) {
    this.pushToTenant(tenantId, 'delivery:result', log);
  }

  pushLowStock(
    tenantId: number,
    items: { pool: { id: number; name: string }; stock: number; threshold: number }[],
  ) {
    this.pushToTenant(tenantId, 'kami:lowstock', items);
  }

  pushAccountExpired(tenantId: number, accountId: number) {
    this.pushToTenant(tenantId, 'account:expired', { accountId });
  }

  /** 账号触发闲鱼风控（FAIL_SYS_USER_VALIDATE 等），系统进入冷静期 */
  pushAccountCaptcha(
    tenantId: number,
    payload: {
      accountId: number;
      nickname?: string;
      pauseUntil: number;
      remainingMs: number;
      message: string;
    },
  ) {
    this.pushToTenant(tenantId, 'account:captcha', payload);
  }
}
