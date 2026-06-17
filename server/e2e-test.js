/**
 * 端到端冒烟测试脚本。
 * 1. 注册登录 → 获取 token
 * 2. 添加闲鱼账号
 * 3. 创建卡密池 + 添加卡密
 * 4. 创建商品规则
 * 5. 等待 Mock 订单自动生成（15秒）
 * 6. 查看订单和发货日志
 */
const BASE = 'http://localhost:3000/api';

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

let token;
const log = (label, data) => console.log(`\n[${label}]`, JSON.stringify(data, null, 2));

async function main() {
  // 1. 注册
  let res = await api('POST', '/auth/register', {
    username: `user_${Date.now()}`,
    password: '123456',
    nickname: '测试用户',
  });
  log('注册', res);
  token = res.data?.accessToken;

  if (!token) {
    // 登录
    res = await api('POST', '/auth/login', { username: 'demo', password: '123456' });
    log('登录', res);
    token = res.data?.accessToken;
  }

  // 2. 签名服务
  res = await api('GET', '/sign/info');
  log('签名服务', res);

  // 3. 添加闲鱼账号
  res = await api('POST', '/accounts', {
    nickname: '测试闲鱼店',
    xianyuUid: 'xy_test_001',
    cookie: '_m_h5_tk=abcd1234_efgh5678; cookie2=testcookievalue; sgcookie=sgtest123',
  });
  log('添加账号', res);

  // 4. 创建卡密池
  res = await api('POST', '/kami/pools', { name: 'Steam CDK池', remark: '赛博朋克2077' });
  log('创建卡密池', res);
  const poolId = res.data?.id || 1;

  // 5. 添加卡密
  res = await api('POST', `/kami/items/${poolId}`, {
    contents: ['CDK-AAAA-1111-2222', 'CDK-BBBB-3333-4444', 'CDK-CCCC-5555-6666'],
  });
  log('添加卡密', res);

  // 6. 创建商品规则
  res = await api('POST', '/products', {
    accountId: 1,
    itemId: 'mock_item_kami_001',
    title: 'Steam游戏CDK-赛博朋克2077',
    deliveryType: 'kami',
    kamiPoolId: poolId,
    remark: '有问题联系客服',
  });
  log('创建商品规则', res);

  // 7. 查看列表
  res = await api('GET', '/accounts');
  log('账号列表', res.data?.length ? `共 ${res.data.length} 个` : '空');

  res = await api('GET', '/products');
  log('商品规则列表', res.data?.length ? `共 ${res.data.length} 个` : '空');

  res = await api('GET', `/kami/stock/${poolId}`);
  log('库存', res);

  // 8. 等待 Mock 订单产生
  console.log('\n⏳ 等待 20 秒，让 Mock 订单自动生成并处理...');
  await new Promise((r) => setTimeout(r, 20000));

  // 9. 查看订单和发货日志
  res = await api('GET', '/orders/stats');
  log('订单统计', res);

  res = await api('GET', '/orders?page=1&size=10');
  log('订单列表', res.data?.list?.length ? `共 ${res.data.total} 条` : '暂无');

  res = await api('GET', '/delivery/logs?page=1&size=10');
  log('发货日志', res.data?.list?.length ? `共 ${res.data.total} 条` : '暂无');

  console.log('\n✅ 冒烟测试完成！');
}

main().catch((e) => {
  console.error('测试失败:', e);
  process.exit(1);
});
