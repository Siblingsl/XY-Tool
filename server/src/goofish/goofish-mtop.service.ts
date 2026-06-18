import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { isGoofishSessionExpiredFromRet } from './goofish-error.util';
import {
  GOOFISH_APP_KEY,
  GOOFISH_MTOP_BASE,
  GOOFISH_SELLER_ORDER_HEADERS,
} from './goofish.constants';
import {
  cookiesToString,
  extractMtopToken,
  mergeSetCookie,
  parseCookies,
} from './goofish-cookie.util';
import { generateGoofishSign } from './goofish-sign.util';
import { GoofishSdkService } from './goofish-sdk.service';

export class GoofishMtopError extends Error {
  constructor(
    public readonly api: string,
    public readonly code: string,
    public readonly detail: unknown,
  ) {
    super(`goofish mtop ${api} 失败: ${code}`);
    this.name = 'GoofishMtopError';
  }
}

const SOLD_ORDERS_API = 'mtop.taobao.idle.trade.merchant.sold.get';

@Injectable()
export class GoofishMtopService {
  private readonly logger = new Logger(GoofishMtopService.name);

  constructor(private readonly sdkService: GoofishSdkService) {}

  /** 卖家待发货订单列表（独立请求，不走通用 mtopPost，避免 spm_cnt / Origin 干扰） */
  async fetchSoldOrders(
    cookie: string,
    pageNumber = 1,
    rowsPerPage = 30,
    queryCode: 'NOT_SHIP' | 'ALL' = 'NOT_SHIP',
  ): Promise<{
    orders: ParsedSoldOrder[];
    hasNext: boolean;
    cookie: string;
  }> {
    try {
      let jar = parseCookies(cookie);
      if (!jar._m_h5_tk) {
        jar = parseCookies(await this.refreshLogin(cookie));
      }

      const { data, jar: updatedJar } = await this.fetchSoldOrdersOnce(
        jar,
        pageNumber,
        rowsPerPage,
        queryCode,
        false,
      );

      const module = data?.module || {};
      const items = module.items || [];
      const hasNext = module.nextPage === 'true';
      const orders = items
        .map((item) => this.parseSoldOrderItem(item))
        .filter((o): o is ParsedSoldOrder => o != null);

      this.logger.debug(`拉取待发货订单 ${orders.length} 条 (page=${pageNumber})`);
      return { orders, hasNext, cookie: cookiesToString(updatedJar) };
    } catch (e) {
      const err = e as Error;
      throw new GoofishMtopError(SOLD_ORDERS_API, err.message, null);
    }
  }

  private async fetchSoldOrdersOnce(
    jar: Record<string, string>,
    pageNumber: number,
    rowsPerPage: number,
    queryCode: string,
    isRetry: boolean,
  ): Promise<{
    data: { module?: { items?: Array<Record<string, unknown>>; nextPage?: string } };
    jar: Record<string, string>;
  }> {
    const dataVal = JSON.stringify({
      pageNumber,
      rowsPerPage,
      orderIds: '',
      queryCode,
      orderSearchParam: '{}',
    });

    const t = String(Date.now());
    const token = extractMtopToken(cookiesToString(jar));
    const sign = generateGoofishSign(t, token, dataVal);

    const params = {
      jsv: '2.7.2',
      appKey: GOOFISH_APP_KEY,
      t,
      sign,
      v: '1.0',
      type: 'json',
      accountSite: 'xianyu',
      dataType: 'json',
      timeout: '20000',
      api: SOLD_ORDERS_API,
      valueType: 'string',
      sessionOption: 'AutoLoginOnly',
    };

    const url = `${GOOFISH_MTOP_BASE}/${SOLD_ORDERS_API}/1.0/`;
    const resp = await axios.post(
      url,
      new URLSearchParams({ data: dataVal }).toString(),
      {
        params,
        headers: {
          ...GOOFISH_SELLER_ORDER_HEADERS,
          cookie: cookiesToString(jar),
        },
        timeout: 20_000,
        validateStatus: () => true,
        responseType: 'text',
      },
    );

    let updatedJar = mergeSetCookie(jar, resp.headers['set-cookie']);

    const rawText = typeof resp.data === 'string' ? resp.data.trim() : '';
    if (!rawText) {
      throw new Error(
        `HTTP ${resp.status} 空响应（请检查 Cookie 是否有效、是否开通卖家中心）`,
      );
    }

    let json: { ret?: string[]; data?: { module?: { items?: unknown[]; nextPage?: string } } };
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error(
        `HTTP ${resp.status} 非 JSON 响应: ${rawText.slice(0, 120)}`,
      );
    }

    const ret = json.ret?.[0] || '';
    if (!ret.startsWith('SUCCESS::')) {
      if (!isRetry && ret.includes('令牌过期')) {
        this.logger.warn('订单拉取令牌过期，刷新 Cookie 后重试');
        return this.fetchSoldOrdersOnce(updatedJar, pageNumber, rowsPerPage, queryCode, true);
      }
      if (isGoofishSessionExpiredFromRet(json.ret)) {
        throw new Error(ret || 'FAIL_SYS_SESSION_EXPIRED');
      }
      throw new Error(ret || `HTTP ${resp.status}`);
    }

    return {
      data: (json.data || {}) as {
        module?: { items?: Array<Record<string, unknown>>; nextPage?: string };
      },
      jar: updatedJar,
    };
  }

  /** 获取 IM WebSocket accessToken（goofish-sdk getToken） */
  async getImAccessToken(cookie: string): Promise<{ token: string; cookie: string }> {
    const client = this.sdkService.createClient(cookie);
    const raw = await client.getToken();
    const data = this.sdkService.assertMtopSuccess<{ accessToken?: string }>(
      raw,
      'mtop.taobao.idlemessage.pc.login.token',
    );
    const token = data?.accessToken;
    if (!token) {
      throw new GoofishMtopError(
        'mtop.taobao.idlemessage.pc.login.token',
        'NO_ACCESS_TOKEN',
        data,
      );
    }
    return { token, cookie: client.getCookieString() };
  }

  /** 刷新登录态（goofish-sdk refreshToken） */
  async refreshLogin(cookie: string): Promise<string> {
    const client = this.sdkService.createClient(cookie);
    await client.refreshToken();
    return client.getCookieString();
  }

  /** 订单详情 */
  async fetchOrderDetail(
    cookie: string,
    orderId: string,
  ): Promise<{
    cookie: string;
    itemId?: string;
    itemTitle?: string;
    buyerId?: string;
    buyerNick?: string;
    amount?: number;
  }> {
    const { data, cookie: updatedCookie } = await this.sdkService.mtop<Record<string, unknown>>(
      cookie,
      'mtop.idle.web.trade.order.detail',
      { orderId: String(orderId) },
      { v: '1.0', spm_cnt: 'a21ybx.order-detail.0.0' },
    );

    const components = (data?.components as Array<Record<string, unknown>>) || [];
    let itemId = '';
    let itemTitle = '';
    let amount: number | undefined;

    for (const comp of components) {
      if (String(comp.render ?? '') === 'orderInfoVO') {
        const compData = (comp.data as Record<string, unknown>) || {};
        const info = (compData.itemInfo as Record<string, unknown>) || {};
        itemId = String(info.itemId ?? itemId);
        itemTitle = String(info.title ?? info.itemTitle ?? itemTitle);
        const yuan = parseFloat(String(info.price ?? ''));
        if (!Number.isNaN(yuan)) amount = Math.round(yuan * 100);

        const buyerId = String(
          compData.buyerUserId ?? compData.buyerId ?? '',
        );
        const buyerNick = String(
          compData.buyerNick ?? compData.buyerUserNick ?? '',
        );
        return {
          cookie: updatedCookie,
          itemId: itemId || undefined,
          itemTitle: itemTitle || undefined,
          buyerId: buyerId || undefined,
          buyerNick: buyerNick || undefined,
          amount,
        };
      }
    }

    return {
      cookie: updatedCookie,
      itemId: itemId || undefined,
      itemTitle: itemTitle || undefined,
      amount,
    };
  }

  /** 虚拟商品确认发货（无需物流） */
  async confirmVirtualShip(
    cookie: string,
    orderId: string,
  ): Promise<{ ok: boolean; cookie: string }> {
    const dataVal = JSON.stringify({
      orderId: String(orderId),
      tradeText: '',
      picList: [],
      newUnconsign: true,
    });

    const { cookie: updatedCookie } = await this.sdkService.mtop(
      cookie,
      'mtop.taobao.idle.logistic.consign.dummy',
      dataVal,
      { v: '1.0', type: 'originaljson' },
    );

    return { ok: true, cookie: updatedCookie };
  }

  private parseSoldOrderItem(item: Record<string, unknown>): ParsedSoldOrder | null {
    const common = (item.commonData as Record<string, unknown>) || {};
    const buyerInfo = (item.buyerInfoVO as Record<string, unknown>) || {};
    const priceVo = (item.priceVO as Record<string, unknown>) || {};
    const itemInfo = (item.itemInfoVO as Record<string, unknown>) || {};

    const bizOrderId = String(common.orderId ?? '');
    if (!bizOrderId) return null;
    // 退款中的订单不再直接丢弃：标记 inRefund=true 返回，
    // 由上游 OrderPollingService 决定是否建单并标记 REFUNDING 状态，
    // 避免退款订单在拉单时彻底消失、无法感知。
    const inRefund = common.inRefund === 'true';

    const totalPrice = String(priceVo.totalPrice ?? '0');
    let amountCents = 0;
    const yuan = parseFloat(totalPrice);
    if (!Number.isNaN(yuan)) amountCents = Math.round(yuan * 100);

    const createTimeStr = String(common.createTime ?? '');
    let orderCreatedAt: Date | undefined;
    if (createTimeStr) {
      const d = new Date(createTimeStr.replace(' ', 'T'));
      if (!Number.isNaN(d.getTime())) orderCreatedAt = d;
    }

    const itemId = String(common.itemId ?? itemInfo.itemId ?? '');
    const itemTitle = String(
      common.itemTitle ?? itemInfo.title ?? itemInfo.itemTitle ?? itemId ?? '闲鱼商品',
    );

    return {
      bizOrderId,
      itemId,
      itemTitle,
      buyerNick: buyerInfo.userNick ? String(buyerInfo.userNick) : undefined,
      buyerId: buyerInfo.buyerId ? String(buyerInfo.buyerId) : undefined,
      amount: amountCents,
      tradeStatus: String(common.orderStatus ?? ''),
      inRefund,
      orderCreatedAt,
    };
  }
}

export interface ParsedSoldOrder {
  bizOrderId: string;
  itemId: string;
  itemTitle: string;
  buyerNick?: string;
  buyerId?: string;
  amount?: number;
  tradeStatus?: string;
  /** 是否处于退款中（mtop commonData.inRefund === 'true'） */
  inRefund?: boolean;
  orderCreatedAt?: Date;
}
