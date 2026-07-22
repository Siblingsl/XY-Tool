import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/**
 * 实时推送模块。
 * 通过 WebSocket 将订单状态变化、发货结果、低库存告警等
 * 实时推送到前端控制台，替代高频轮询。
 */
@Module({
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
