/**
 * 闲鱼 (Goofish) SDK — 供 NestJS / Node.js 项目直接引用
 *
 * ═══════════════════════════════════════════════════════════════════
 *  复制到你的 NestJS 项目 — 文件清单
 * ═══════════════════════════════════════════════════════════════════
 *
 * 【必须复制】（没有这些 SDK 无法启动）
 *
 *   your-nestjs-project/
 *   └── src/goofish/                  ← 目录名可自定，保持相对路径即可
 *       ├── goofish-sdk.js            ← 本文件，SDK 主入口 (~21 KB)
 *       └── static/
 *           └── goofish_js_version_2.js  ← 签名 & 解密核心 (~20 KB)
 *
 * 【按需复制】（仅当你需要「未登录时自动初始化风控 Cookie / tfstk」）
 *
 *       └── utils/
 *           ├── gen_tfstk.js          ← Node 补环境生成 tfstk (~18 KB)
 *           └── et_f.js               ← 阿里 AWSC 风控 SDK (~313 KB)
 *
 *   说明：若你已有浏览器登录后的完整 Cookie（含 unb / _m_h5_tk 等），
 *         可以不复制 utils/ 目录，直接 new GoofishClient(cookie) 即可。
 *
 * 【不要复制】（本项目保留作参考，你的项目用不到）
 *
 *   static/goofish_js_version_1.js         — v2 的旧版，已被替代
 *   static/goofish_js_origin_version_2.js  — 10 万行网页原始 webpack 包，仅供逆向参考
 *   goofish_apis.py / goofish_live.py      — Python 版实现，NestJS 不需要
 *   utils/goofish_utils.py                 — Python 版工具，NestJS 不需要
 *   utils/build_cookies.py                 — Python 版 Cookie 构建，NestJS 不需要
 *
 * ── static/ 下三个 JS 文件的关系 ──────────────────────────────────
 *
 *   goofish_js_origin_version_2.js (4344 KB, 10万+行)
 *       ↑ 从闲鱼网页抓取的完整 webpack 打包，混淆严重，不参与运行
 *       │ 逆向工程师从中抽取核心算法 ↓
 *   goofish_js_version_1.js (15 KB)  — 第一版精简，解密函数名为 rK()
 *       ↓ 优化变量命名、修复边界情况
 *   goofish_js_version_2.js (20 KB)  — ★ 当前唯一在用的版本，解密函数名为 a3()
 *
 * ── 各文件在你项目中的用途 ─────────────────────────────────────────
 *
 *   goofish-sdk.js
 *     · GoofishClient        — HTTP API（getToken / refreshToken / getItemInfo / uploadMedia / publishItem）
 *     · GoofishRiskControl   — 未登录态 Cookie 初始化（cna / _m_h5_tk / tfstk）
 *     · generateSign         — 所有 MTOP 请求的 MD5 签名
 *     · decrypt / parseWsPushMessage — WebSocket 推送消息解密
 *     · buildSendMessage 等  — IM 发消息 / 心跳 / 注册 协议帧构造
 *
 *   static/goofish_js_version_2.js
 *     · generate_sign        — 被 goofish-sdk 内部调用
 *     · decrypt              — MessagePack 解密（WS 收消息必需）
 *     · generate_mid/uuid/device_id — IM 协议字段生成
 *
 *   utils/gen_tfstk.js + et_f.js（可选）
 *     · 模拟浏览器环境，生成 tfstk 风控 Cookie
 *     · 用于扫码登录前 / Cookie 过期重建，已有登录 Cookie 时可跳过
 *
 * ── NestJS 额外 npm 依赖 ───────────────────────────────────────────
 *
 *   npm i ws @types/ws        ← WebSocket 实时收消息时需要
 *   Node.js >= 18             ← 使用原生 fetch / FormData
 *
 * ── 最小接入示例 ─────────────────────────────────────────────────────
 *
 *   const { GoofishClient, parseWsPushMessage } = require('./goofish/goofish-sdk.js');
 *
 *   @Injectable()
 *   export class GoofishService {
 *     private client = new GoofishClient(process.env.GOOFISH_COOKIE);
 *     async onModuleInit() { await this.client.getToken(); }
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ── 加载逆向 JS（签名 / 解密） ─────────────────────────────────────
// 只使用 goofish_js_version_2.js。
// version_1 是旧版精简实现（解密入口 rK），origin_version_2 是 10 万行网页原始包，均不参与运行。
const CRYPTO_JS = path.join(__dirname, 'static', 'goofish_js_version_2.js');
if (!fs.existsSync(CRYPTO_JS)) {
  throw new Error(`[goofish-sdk] 缺少 ${CRYPTO_JS}，请一并复制 static 目录`);
}
const cryptoLib = require(CRYPTO_JS);

// ── 常量 ────────────────────────────────────────────────────────────
const APP_KEY = '34839810';
const IM_APP_KEY = '444e9908a51d1cb236a27862abc769c9';
const MTOP_BASE = 'https://h5api.m.goofish.com/h5';
const WS_URL = 'wss://wss-goofish.dingtalk.com/';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const MTOP_HEADERS = {
  'User-Agent': UA,
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

// ── Cookie 工具 ───────────────────────────────────────────────────
function parseCookies(cookiesStr) {
  const out = {};
  if (!cookiesStr || typeof cookiesStr !== 'string') return out;
  for (const part of cookiesStr.split('; ')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    out[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return out;
}

function cookiesToString(cookies) {
  return Object.entries(cookies)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function mergeSetCookie(existing, setCookieHeader) {
  const jar = { ...existing };
  if (!setCookieHeader) return jar;
  const lines = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const line of lines) {
    const pair = line.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}

// ── 签名 & 解密（对外暴露） ─────────────────────────────────────────
function generateSign(t, token, data) {
  return cryptoLib.generate_sign(String(t), token, data);
}

function generateMid() {
  return cryptoLib.generate_mid();
}

function generateUuid() {
  return cryptoLib.generate_uuid();
}

function generateDeviceId(userId) {
  return cryptoLib.generate_device_id(String(userId || ''));
}

/** 解密 WebSocket 推送的 base64 MessagePack 载荷，返回 JSON 字符串 */
function decrypt(raw) {
  return cryptoLib.decrypt(raw);
}

/** 解密并解析为对象 */
function decryptObject(raw) {
  return JSON.parse(decrypt(raw));
}

/**
 * 解析 WS syncPushPackage 推送
 * @returns {{ cid, senderUserId, senderUserName, content, raw } | null}
 */
function parseWsPushMessage(wsBody) {
  try {
    const pkg = wsBody?.syncPushPackage?.data?.[0]?.data;
    if (!pkg) return null;

    let parsed;
    try {
      parsed = typeof pkg === 'string' ? JSON.parse(pkg) : pkg;
    } catch {
      parsed = decryptObject(pkg);
    }

    const inner = parsed['1'];
    if (!inner) return null;

    const ext = inner['10'] || {};
    const cid = String(inner['2'] || '').split('@')[0];

    return {
      cid,
      senderUserId: ext.senderUserId || '',
      senderUserName: ext.reminderTitle || '',
      content: ext.reminderContent || '',
      raw: parsed,
    };
  } catch {
    return null;
  }
}

/** 解析历史消息列表里 custom.data (base64 JSON) */
function parseHistoryMessageContent(base64Data) {
  const json = Buffer.from(base64Data, 'base64').toString('utf8');
  return JSON.parse(json);
}

// ── IM 消息构造 ─────────────────────────────────────────────────────
function makeTextPayload(text) {
  const payload = { contentType: 1, text: { text } };
  return {
    type: 1,
    data: Buffer.from(JSON.stringify(payload)).toString('base64'),
  };
}

function makeImagePayload(url, width = 0, height = 0) {
  const payload = {
    contentType: 2,
    image: { pics: [{ type: 0, url, width, height }] },
  };
  return {
    type: 2,
    data: Buffer.from(JSON.stringify(payload)).toString('base64'),
  };
}

function buildSendMessage({ cid, toUserId, myUserId, text, imageUrl, imageWidth, imageHeight }) {
  let custom;
  if (text != null) {
    custom = makeTextPayload(text);
  } else if (imageUrl) {
    custom = makeImagePayload(imageUrl, imageWidth, imageHeight);
  } else {
    throw new Error('text 或 imageUrl 至少提供一个');
  }

  return {
    lwp: '/r/MessageSend/sendByReceiverScope',
    headers: { mid: generateMid() },
    body: [
      {
        uuid: generateUuid(),
        cid: `${cid}@goofish`,
        conversationType: 1,
        content: {
          contentType: 101,
          custom: { type: custom.type, data: custom.data },
        },
        redPointPolicy: 0,
        extension: { extJson: '{}' },
        ctx: { appVersion: '1.0', platform: 'web' },
        mtags: {},
        msgReadStatusSetting: 1,
      },
      {
        actualReceivers: [`${toUserId}@goofish`, `${myUserId}@goofish`],
      },
    ],
  };
}

function buildWsAck(incoming) {
  const ack = {
    code: 200,
    headers: {
      mid: incoming?.headers?.mid || generateMid(),
      sid: incoming?.headers?.sid || '',
    },
  };
  for (const k of ['app-key', 'ua', 'dt']) {
    if (incoming?.headers?.[k]) ack.headers[k] = incoming.headers[k];
  }
  return ack;
}

function buildWsReg(accessToken, deviceId) {
  return {
    lwp: '/reg',
    headers: {
      'cache-header': 'app-key token ua wv',
      'app-key': IM_APP_KEY,
      token: accessToken,
      ua:
        UA +
        ' DingTalk(2.1.5) OS(Windows/10) Browser(Chrome/147.0.0.0) DingWeb/2.1.5 IMPaaS DingWeb/2.1.5',
      dt: 'j',
      wv: 'im:3,au:3,sy:6',
      sync: '0,0;0;0;',
      did: deviceId,
      mid: generateMid(),
    },
  };
}

function buildWsHeartbeat() {
  return { lwp: '/!', headers: { mid: generateMid() } };
}

function buildSyncAck() {
  const ts = Date.now();
  return {
    lwp: '/r/SyncStatus/ackDiff',
    headers: { mid: generateMid() },
    body: [
      {
        pipeline: 'sync',
        tooLong2Tag: 'PNM,1',
        channel: 'sync',
        topic: 'sync',
        highPts: 0,
        pts: ts * 1000,
        seq: 0,
        timestamp: ts,
      },
    ],
  };
}

// ── 风控：初始 Cookie & tfstk ───────────────────────────────────────
// 依赖 utils/gen_tfstk.js + utils/et_f.js（可选）。
// 若已有登录 Cookie，可跳过此类，直接使用 GoofishClient。
class GoofishRiskControl {
  /**
   * @param {object} [options]
   * @param {string} [options.sdkDir] - SDK 根目录，默认 __dirname
   * @param {boolean} [options.withTfstk=true]
   */
  constructor(options = {}) {
    this.sdkDir = options.sdkDir || __dirname;
    this.withTfstk = options.withTfstk !== false;
  }

  /** 调用 node utils/gen_tfstk.js 生成 tfstk */
  generateTfstk(timeoutMs = 15000) {
    const script = path.join(this.sdkDir, 'utils', 'gen_tfstk.js');
    if (!fs.existsSync(script)) {
      console.warn('[goofish-sdk] gen_tfstk.js 不存在，跳过 tfstk');
      return '';
    }
    try {
      const r = spawnSync(process.execPath, [script], {
        cwd: this.sdkDir,
        timeout: timeoutMs,
        encoding: 'utf8',
      });
      if (r.status !== 0) {
        console.warn('[goofish-sdk] gen_tfstk 失败:', r.stderr?.slice(0, 200));
        return '';
      }
      return (r.stdout || '').trim();
    } catch (e) {
      console.warn('[goofish-sdk] gen_tfstk 异常:', e.message);
      return '';
    }
  }

  /**
   * 纯 HTTP 获取闲鱼初始 cookie（未登录态）
   * @returns {Promise<Record<string,string>>}
   */
  async buildInitialCookies() {
    let jar = {};

    const applySetCookie = (res) => {
      jar = mergeSetCookie(jar, res.headers.getSetCookie?.());
    };

    const cookieHeader = () => cookiesToString(jar);

    // 1) cna
    let res = await fetch('https://log.mmstat.com/eg.js', {
      headers: { 'User-Agent': UA },
    });
    applySetCookie(res);

    const mtopApis = [
      'mtop.taobao.idlehome.home.webpc.feed',
      'mtop.gaia.nodejs.gaia.idle.data.gw.v2.index.get',
    ];

    for (const api of mtopApis) {
      const qs = new URLSearchParams({
        jsv: '2.7.2',
        appKey: APP_KEY,
        t: String(Date.now()),
        sign: '',
        v: '1.0',
        type: 'originaljson',
        dataType: 'json',
        timeout: '20000',
        api,
        sessionOption: 'AutoLoginOnly',
        spm_cnt: 'a21ybx.home.0.0',
      });

      res = await fetch(`${MTOP_BASE}/${api}/1.0/?${qs}`, {
        method: 'POST',
        headers: { ...MTOP_HEADERS, Cookie: cookieHeader() },
        body: 'data=%7B%7D',
      });
      applySetCookie(res);
    }

    if (this.withTfstk) {
      const tfstk = this.generateTfstk();
      if (tfstk) jar.tfstk = tfstk;
    }

    return {
      cna: jar.cna || '',
      xlly_s: jar.xlly_s || '1',
      mtop_partitioned_detect: jar.mtop_partitioned_detect || '1',
      _m_h5_tk: jar._m_h5_tk || '',
      _m_h5_tk_enc: jar._m_h5_tk_enc || '',
      cookie2: jar.cookie2 || '',
      tfstk: jar.tfstk || '',
    };
  }
}

// ── HTTP API 客户端 ─────────────────────────────────────────────────
class GoofishClient {
  /**
   * @param {string|Record<string,string>} cookies - Cookie 字符串或对象
   * @param {object} [options]
   * @param {string} [options.deviceId] - 不传则根据 unb 自动生成
   */
  constructor(cookies, options = {}) {
    this.cookies =
      typeof cookies === 'string' ? parseCookies(cookies) : { ...cookies };
    this.deviceId =
      options.deviceId || generateDeviceId(this.cookies.unb || '');
    this.userId = this.cookies.unb || '';
  }

  getCookieString() {
    return cookiesToString(this.cookies);
  }

  /** 从响应更新 _m_h5_tk 等 */
  _applyResponseCookies(res) {
    this.cookies = mergeSetCookie(this.cookies, res.headers.getSetCookie?.());
  }

  _getMtopToken() {
    const tk = this.cookies._m_h5_tk || '';
    return tk.split('_')[0];
  }

  /**
   * 通用 MTOP POST
   * @param {string} api - 如 mtop.taobao.idle.pc.detail
   * @param {object|string} data - 请求体 data 字段
   * @param {object} [extraParams]
   */
  async mtopPost(api, data, extraParams = {}) {
    const dataStr =
      typeof data === 'string' ? data : JSON.stringify(data);
    const t = String(Date.now());
    const token = this._getMtopToken();
    const sign = generateSign(t, token, dataStr);

    const version = extraParams.v || '1.0';
    const params = new URLSearchParams({
      jsv: '2.7.2',
      appKey: APP_KEY,
      t,
      sign,
      v: version,
      type: extraParams.type || 'originaljson',
      accountSite: 'xianyu',
      dataType: 'json',
      timeout: '20000',
      api,
      sessionOption: 'AutoLoginOnly',
      spm_cnt: extraParams.spm_cnt || 'a21ybx.im.0.0',
      ...(extraParams.valueType ? { valueType: extraParams.valueType } : {}),
      ...(extraParams.log_id ? { spm_pre: extraParams.spm_pre, log_id: extraParams.log_id } : {}),
    });

    const url = `${MTOP_BASE}/${api}/${version}/?${params}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...MTOP_HEADERS,
        ...(extraParams.extraHeaders || {}),
        Cookie: this.getCookieString(),
      },
      body: new URLSearchParams({ data: dataStr }),
    });

    this._applyResponseCookies(res);
    const text = await res.text();
    if (!text || !text.trim()) {
      throw new Error(`mtop ${api} 空响应 (HTTP ${res.status})`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`mtop ${api} 非 JSON 响应 (HTTP ${res.status}): ${text.slice(0, 120)}`);
    }

    // 令牌过期自动重试一次
    if (json?.ret?.[0]?.includes('令牌过期')) {
      return this.mtopPost(api, data, extraParams);
    }
    return json;
  }

  /** 获取 IM WebSocket accessToken */
  async getToken() {
    const dataVal = JSON.stringify({
      appKey: IM_APP_KEY,
      deviceId: this.deviceId,
    });
    return this.mtopPost('mtop.taobao.idlemessage.pc.login.token', dataVal, {
      v: '1.0',
      spm_cnt: 'a21ybx.im.0.0',
      spm_pre: 'a21ybx.item.want.1.14ad3da6ALVq3n',
      log_id: '14ad3da6ALVq3n',
    });
  }

  /** 刷新登录态（建议每 10 分钟调用） */
  async refreshToken() {
    return this.mtopPost('mtop.taobao.idlemessage.pc.loginuser.get', '{}', {
      v: '1.0',
      spm_pre: 'a21ybx.item.want.1.12523da6waCtUp',
      log_id: '12523da6waCtUp',
    });
  }

  /** 商品详情 */
  async getItemInfo(itemId) {
    return this.mtopPost('mtop.taobao.idle.pc.detail', { itemId: String(itemId) });
  }

  /** 上传图片（聊天/发布用） */
  async uploadMedia(filePathOrBuffer, filename = 'image.png') {
    const FormData = globalThis.FormData || require('undici').FormData;
    const form = new FormData();

    if (Buffer.isBuffer(filePathOrBuffer)) {
      form.append('file', new Blob([filePathOrBuffer]), filename);
    } else {
      const buf = fs.readFileSync(filePathOrBuffer);
      form.append('file', new Blob([buf]), path.basename(filePathOrBuffer));
    }

    const res = await fetch(
      'https://stream-upload.goofish.com/api/upload.api?floderId=0&appkey=xy_chat&_input_charset=utf-8',
      {
        method: 'POST',
        headers: {
          Cookie: this.getCookieString(),
          'User-Agent': UA,
          Origin: 'https://www.goofish.com',
          Referer: 'https://www.goofish.com/',
        },
        body: form,
      },
    );
    this._applyResponseCookies(res);
    return res.json();
  }

  /** 发布商品 — 分类推荐 */
  async getPublicChannel(title, imageInfos) {
    return this.mtopPost(
      'mtop.taobao.idle.kgraph.property.recommend',
      {
        title,
        lockCpv: false,
        multiSKU: false,
        publishScene: 'mainPublish',
        scene: 'newPublishChoice',
        description: title,
        imageInfos: imageInfos.map((img) => ({
          extraInfo: { isH: 'false', isT: 'false', raw: 'false' },
          isQrCode: false,
          url: img.url,
          heightSize: img.height,
          widthSize: img.width,
          major: true,
          type: 0,
          status: 'done',
        })),
        uniqueCode: String(Date.now()) + '677',
      },
      { v: '2.0', spm_cnt: 'a21ybx.publish.0.0' },
    );
  }

  /** 默认发货地址 */
  async getDefaultLocation(longitude = 118.78248347393424, latitude = 31.91629189813543) {
    return this.mtopPost('mtop.taobao.idle.local.poi.get', { longitude, latitude }, {
      v: '1.0',
      spm_cnt: 'a21ybx.publish.0.0',
    });
  }

  /**
   * 组装发布/草稿共用 payload（上传图片、分类推荐、地址）
   * @param {object} opts
   * @param {string[]} [opts.imagePaths] 本地图片路径
   * @param {Array<{url:string,width?:number,height?:number}>} [opts.imageInfos] 已上传 CDN 图
   * @param {string} opts.goodsDesc 描述（可含标题）
   * @param {string} [opts.title] 标题（可选，默认用描述前 30 字）
   * @param {{ currentPrice?: number, originalPrice?: number } | null} [opts.price]
   * @param {{ choice?: string, postPrice?: number, canSelfPickup?: boolean }} [opts.delivery]
   */
  async _buildItemPublishData({
    imagePaths = [],
    imageInfos = [],
    goodsDesc,
    title,
    price = null,
    delivery = {},
  }) {
    const desc = String(goodsDesc || '').trim();
    if (!desc) throw new Error('商品描述不能为空');

    const titleText = String(title || desc).trim().slice(0, 60) || desc.slice(0, 60);

    const data = {
      freebies: false,
      itemTypeStr: 'b',
      quantity: '1',
      simpleItem: 'true',
      imageInfoDOList: [],
      itemTextDTO: {
        desc,
        title: titleText,
        titleDescSeparate: !!title && title !== desc,
      },
      itemLabelExtList: [],
      itemPriceDTO: {},
      userRightsProtocols: [{ enable: false, serviceCode: 'SKILL_PLAY_NO_MIND' }],
      itemPostFeeDTO: {
        canFreeShipping: false,
        supportFreight: false,
        onlyTakeSelf: false,
      },
      itemAddrDTO: {},
      defaultPrice: false,
      itemCatDTO: {},
      uniqueCode: String(Date.now()) + '680',
      sourceId: 'pcMainPublish',
      bizcode: 'pcMainPublish',
      publishScene: 'pcMainPublish',
    };

    const imagesInfo = [...imageInfos];
    for (const p of imagePaths) {
      const up = await this.uploadMedia(p);
      const obj = up?.object;
      if (!obj?.url) {
        throw new Error(`图片上传失败: ${path.basename(String(p))}`);
      }
      const pix = String(obj.pix || '800x800');
      const [w, h] = pix.split('x').map(Number);
      imagesInfo.push({ url: obj.url, width: w || 800, height: h || 800 });
    }

    if (imagesInfo.length === 0) {
      throw new Error('至少需要 1 张商品图片');
    }

    for (const img of imagesInfo) {
      data.imageInfoDOList.push({
        extraInfo: { isH: 'false', isT: 'false', raw: 'false' },
        isQrCode: false,
        url: img.url,
        heightSize: img.height || 800,
        widthSize: img.width || 800,
        major: true,
        type: 0,
        status: 'done',
      });
    }

    const choice = delivery?.choice || '无需邮寄';
    if (choice === '包邮') {
      data.itemPostFeeDTO.canFreeShipping = true;
      data.itemPostFeeDTO.supportFreight = true;
    } else if (choice === '按距离计费') {
      data.itemPostFeeDTO.supportFreight = true;
      data.itemPostFeeDTO.templateId = '-100';
    } else if (choice === '一口价') {
      data.itemPostFeeDTO.supportFreight = true;
      data.itemPostFeeDTO.postPriceInCent = String(Math.round((delivery.postPrice || 0) * 100));
      data.itemPostFeeDTO.templateId = '0';
    } else if (choice === '无需邮寄') {
      data.itemPostFeeDTO.templateId = '0';
    } else {
      throw new Error(`无效的 delivery.choice: ${choice}`);
    }
    if (delivery?.canSelfPickup) data.onlyTakeSelf = true;

    if (price) {
      if (price.currentPrice > 0) {
        data.itemPriceDTO.priceInCent = String(Math.round(price.currentPrice * 100));
      }
      if (price.originalPrice > 0) {
        data.itemPriceDTO.origPriceInCent = String(Math.round(price.originalPrice * 100));
      }
    } else {
      data.defaultPrice = true;
    }

    const channelTitle = titleText || desc;
    const channelRes = await this.getPublicChannel(channelTitle, imagesInfo);
    const cardList = channelRes?.data?.cardList || [];
    for (const card of cardList) {
      const cardData = card.cardData || {};
      const values = cardData.valuesList || [];
      for (const v of values) {
        if (v.isClicked) {
          data.itemLabelExtList.push({
            channelCateName: v.catName,
            valueId: null,
            channelCateId: v.channelCatId,
            valueName: null,
            tbCatId: v.tbCatId,
            subPropertyId: null,
            labelType: 'common',
            subValueId: null,
            labelId: null,
            propertyName: cardData.propertyName,
            isUserClick: '1',
            isUserCancel: null,
            from: 'newPublishChoice',
            propertyId: cardData.propertyId,
            labelFrom: 'newPublish',
            text: v.catName,
            properties: `${cardData.propertyId}##${cardData.propertyName}:${v.channelCatId}##${v.catName}`,
          });
          break;
        }
      }
    }

    const pred = channelRes?.data?.categoryPredictResult || {};
    data.itemCatDTO = {
      catId: String(pred.catId || ''),
      catName: String(pred.catName || ''),
      channelCatId: String(pred.channelCatId || ''),
      tbCatId: String(pred.tbCatId || ''),
    };

    const locRes = await this.getDefaultLocation();
    const addr = locRes?.data?.commonAddresses?.[0];
    if (addr) {
      data.itemAddrDTO = {
        area: addr.area,
        city: addr.city,
        divisionId: addr.divisionId,
        gps: `${addr.longitude},${addr.latitude}`,
        poiId: addr.poiId,
        poiName: addr.poi,
        prov: addr.prov,
      };
    }

    return { data, imagesInfo, rawChannel: channelRes, rawLocation: locRes };
  }

  /**
   * 正式发布商品（上架）— 业务层默认不要直接暴露给前端。
   */
  async publishItem(opts) {
    const { data } = await this._buildItemPublishData(opts);
    return this.mtopPost('mtop.idle.pc.idleitem.publish', data, {
      v: '1.0',
      spm_cnt: 'a21ybx.publish.0.0',
    });
  }

  /**
   * 推送商品到闲鱼。
   *
   * 说明（对齐 XianYuApis-master）：
   * - 公开可用接口只有 `mtop.idle.pc.idleitem.publish`（正式发布）
   * - 不存在稳定的「仅存草稿」mtop API（draft.save 会 FAIL_SYS_API_NOT_FOUND）
   * - 因此本方法与 publishItem 使用同一接口与 payload
   *
   * @returns mtop 原始响应；成功时 ret 以 SUCCESS:: 开头
   */
  async saveItemDraft(opts) {
    const { data, imagesInfo } = await this._buildItemPublishData(opts);
    const api = 'mtop.idle.pc.idleitem.publish';
    const res = await this.mtopPost(api, data, {
      v: '1.0',
      spm_cnt: 'a21ybx.publish.0.0',
    });
    const ret = res?.ret?.[0] || '';
    if (!String(ret).startsWith('SUCCESS::')) {
      const err = new Error(ret || `${api} 失败`);
      err.raw = res;
      throw err;
    }
    return {
      ...res,
      _meta: { api, imagesInfo, draftMode: false, livePublish: true },
    };
  }
}

// ── 导出 ────────────────────────────────────────────────────────────
module.exports = {
  // 常量
  APP_KEY,
  IM_APP_KEY,
  MTOP_BASE,
  WS_URL,
  UA,
  MTOP_HEADERS,

  // 工具
  parseCookies,
  cookiesToString,
  generateSign,
  generateMid,
  generateUuid,
  generateDeviceId,
  decrypt,
  decryptObject,
  parseWsPushMessage,
  parseHistoryMessageContent,

  // WS 协议
  makeTextPayload,
  makeImagePayload,
  buildSendMessage,
  buildWsAck,
  buildWsReg,
  buildWsHeartbeat,
  buildSyncAck,

  // 类
  GoofishRiskControl,
  GoofishClient,
};
