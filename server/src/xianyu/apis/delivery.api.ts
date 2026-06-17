import { Injectable } from '@nestjs/common';
import { MtopClient } from '../mtop-client';
import { MtopRequestContext } from '../interfaces';

/**
 * 闲鱼交易/发货接口封装。
 *
 * 虚拟商品的"确认发货"动作。
 * 注意：很多虚拟卖家只发消息（卡密），不点确认发货，让订单自然完成。
 * 是否需要调用此接口取决于你的发货策略，作为可选能力提供。
 */
@Injectable()
export class DeliveryApi {
  constructor(private readonly client: MtopClient) {}

  /**
   * 确认发货（虚拟商品）。
   *
   * @param ctx          账号上下文
   * @param bizOrderId   业务订单号
   * @param deliverType  发货类型: virtual(虚拟) / express(快递，本工具不用)
   */
  async confirmDelivery(
    ctx: MtopRequestContext,
    bizOrderId: string,
    deliverType: 'virtual' | 'express' = 'virtual',
  ): Promise<boolean> {
    const data = await this.client.invoke<{ success?: boolean }>(
      'mtop.taobao.idle.trade.deliver.confirm',
      {
        bizOrderId,
        deliverType,
        // 虚拟发货：不需要物流单号
        feature: JSON.stringify({ virtual: 'true' }),
      },
      ctx,
      '1.0',
    );
    return data.success !== false;
  }
}
