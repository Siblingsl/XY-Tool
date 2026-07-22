import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RealtimeService } from './realtime.service';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

/**
 * WebSocket 网关。
 *
 * - 路径: /api/ws（通过 vite proxy 转发）
 * - 鉴权: 连接时从 query.token 取 JWT 校验
 * - 房间: 按 tenantId 自动加入 `tenant:<id>` 房间
 *
 * 前端连接示例:
 *   new WebSocket('ws://host/api/ws?token=<accessToken>')
 */
@WebSocketGateway({ path: '/api/ws' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  // 连接 -> tenantId 映射，用于断连时清理
  private clientTenantMap = new Map<WebSocket, number>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly realtimeService: RealtimeService,
  ) {
    // 让 service 可通过此网关发消息
    realtimeService.setServer(this);
  }

  handleConnection(client: WebSocket, request: import('http').IncomingMessage) {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        this.logger.debug('WS 连接无 token，断开');
        client.close(4001, 'Missing token');
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.secret'),
      });

      if (payload.type !== 'access') {
        client.close(4002, 'Use accessToken');
        return;
      }

      const tenantId = payload.tenantId;
      const room = `tenant:${tenantId}`;
      // NestJS WsAdapter 用 client.join(room) 无法直接调用，
      // 改用手动房间管理
      this.clientTenantMap.set(client, tenantId);
      (client as any).__ws_room = room;

      this.logger.log(`WS 已连接 tenant=${tenantId}`);
    } catch {
      this.logger.debug('WS token 校验失败，断开');
      client.close(4003, 'Invalid token');
    }
  }

  handleDisconnect(client: WebSocket) {
    this.clientTenantMap.delete(client);
  }

  /**
   * 向指定租户房间广播消息。
   * 由 RealtimeService 调用。
   */
  emitToTenant(tenantId: number, event: string, data: unknown): void {
    const room = `tenant:${tenantId}`;
    const message = JSON.stringify({ event, data });
    for (const [client, tid] of this.clientTenantMap.entries()) {
      if (tid === tenantId && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}
