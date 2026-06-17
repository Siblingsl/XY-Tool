/**
 * 闲鱼协议常量（与 goofish-sdk.js 导出值一致）。
 * 业务 HTTP 请求优先通过 GoofishSdkService / GoofishClient 发起。
 */
export const GOOFISH_APP_KEY = '34839810';
export const GOOFISH_IM_APP_KEY = '444e9908a51d1cb236a27862abc769c9';
export const GOOFISH_MTOP_BASE = 'https://h5api.m.goofish.com/h5';
export const GOOFISH_WS_URL = 'wss://wss-goofish.dingtalk.com/';

export const GOOFISH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

export const GOOFISH_MTOP_HEADERS: Record<string, string> = {
  'User-Agent': GOOFISH_UA,
  Accept: 'application/json',
  'Accept-Language': 'en,zh-CN;q=0.9,zh;q=0.8,zh-TW;q=0.7,ja;q=0.6',
  'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  Origin: 'https://www.goofish.com',
  Referer: 'https://www.goofish.com/',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  priority: 'u=1, i',
  'Content-Type': 'application/x-www-form-urlencoded',
};

export const GOOFISH_SELLER_ORDER_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'content-type': 'application/x-www-form-urlencoded',
  idle_site_biz_code: 'COMMONPRO',
  Referer: 'https://seller.goofish.com/',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36',
};
