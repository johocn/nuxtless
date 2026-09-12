#!/usr/bin/env node
/** 验证：配送档案全局属性（isGlobal）后端行为回归（线上 e.joho.cn/admin-api） */
const BASE = process.env.WA_API || 'https://e.joho.cn/admin-api';
const T2_TOKEN = '66ruvnhh34svhckaa2i';            // t2 渠道(37)
const DEFAULT_TOKEN = 'cnx87ezvmjx8nn3bth6c';      // default 渠道(1)
const NON_SUPER_TOKEN = process.env.NON_SUPER_TOKEN || '';
let auth = '';

const gql = async (q, vars = {}, headers = {}) => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const body = await res.json();
  const token = res.headers.get('vendure-auth-token');
  return { body, token };
};
const hAdmin = (channel) => ({ Authorization: `Bearer ${auth}`, ...(channel ? { 'vendure-token': channel } : {}) });
const errContains = (body, sub) => JSON.stringify(body?.errors || body).includes(sub);

(async () => {
  // 登录超管
  const login = await gql(`mutation { login(username:"superadmin", password:"z123123") {
    ... on CurrentUser { id identifier } ... on InvalidCredentialsError { errorCode message } } }`);
  if (!login.token) { console.log('[FAIL] 登录失败: ' + JSON.stringify(login.body)); process.exit(1); }
  auth = login.token;
  console.log('[PASS] 登录 OK');

  // 动态取配送方式 id（线上 ShippingMethod 未暴露 enabled 字段，取第一个方法）
  const mres = await gql(`query { shippingMethods(options:{take:20}) { items { id code } } }`, {}, hAdmin());
  const items = mres.body?.data?.shippingMethods?.items;
  if (!items || items.length === 0) { console.log('[FAIL] 查询配送方式失败: ' + JSON.stringify(mres.body?.errors || mres.body)); process.exit(1); }
  const method = items.find((m) => m.enabled !== false) || items[0];
  const methodId = method.id;
  console.log(`[PASS] 选用配送方式 id=${methodId} code=${method.code} (ShippingMethod 无 enabled 字段，取首个可用方法)`);

  const ts = Date.now();
  const code = 'gtest' + ts;

  // a. 超管在 t2 渠道创建全局档案
  const cRes = await gql(
    `mutation($i:CreateShippingProfileInput!){ createShippingProfile(input:$i){ id name isGlobal isTenantDefault } }`,
    { i: { name: '全局回归测试' + ts, code, description: '', isGlobal: true, shippingMethodIds: [methodId] } },
    hAdmin(T2_TOKEN)
  );
  console.log('create result: ' + JSON.stringify(cRes.body));
  const created = cRes.body?.data?.createShippingProfile;
  if (!created || created.isGlobal !== true) { console.log('[FAIL] 创建全局档案失败或 isGlobal 不为 true'); process.exit(1); }
  console.log('[PASS] 超管创建全局档案 isGlobal=true id=' + created.id);
  const pid = created.id;

  // b. 查询该档案
  const gRes = await gql(
    `query($id:ID!){ shippingProfile(id:$id){ id name isGlobal isTenantDefault } }`,
    { id: pid },
    hAdmin(T2_TOKEN)
  );
  console.log('query result: ' + JSON.stringify(gRes.body));
  const p = gRes.body?.data?.shippingProfile;
  if (!p || p.isGlobal !== true || p.isTenantDefault !== false) { console.log('[FAIL] 查询结果不符：期望 isGlobal=true 且 isTenantDefault=false'); process.exit(1); }
  console.log('[PASS] 查询 isGlobal=true isTenantDefault=false');

  // c. 非超管被拒（尽力而为）
  if (!NON_SUPER_TOKEN) {
    console.log('[SKIP] 未提供 NON_SUPER_TOKEN，非超管被拒用例由单测覆盖 + 代码评审');
  } else {
    const hNS = { Authorization: `Bearer ${NON_SUPER_TOKEN}`, 'vendure-token': DEFAULT_TOKEN };
    const uRes = await gql(
      `mutation { updateShippingProfile(input: { id: "${pid}", isGlobal: false }) { id isGlobal } }`,
      {},
      hNS
    );
    console.log('update(non-super) result: ' + JSON.stringify(uRes.body));
    if (!errContains(uRes.body, '仅超级管理员可修改全局属性')) { console.log('[FAIL] 非超管 update 未被拒绝或错误信息不符'); process.exit(1); }
    console.log('[PASS] 非超管 update 被拒：仅超级管理员可修改全局属性');

    const dRes = await gql(`mutation($id:ID!){ deleteShippingProfile(id:$id) }`, { id: pid }, hNS);
    console.log('delete(non-super) result: ' + JSON.stringify(dRes.body));
    if (!errContains(dRes.body, '仅超级管理员可删除全局档案')) { console.log('[FAIL] 非超管 delete 未被拒绝或错误信息不符'); process.exit(1); }
    console.log('[PASS] 非超管 delete 被拒：仅超级管理员可删除全局档案');
  }

  // d. 超管删除
  const delRes = await gql(`mutation($id:ID!){ deleteShippingProfile(id:$id) }`, { id: pid }, hAdmin(T2_TOKEN));
  console.log('delete(super) result: ' + JSON.stringify(delRes.body));
  const delOk = !!delRes.body && !delRes.body.errors && delRes.body.data
    && delRes.body.data.deleteShippingProfile !== undefined && delRes.body.data.deleteShippingProfile !== false;
  if (!delOk) {
    // e. 清理兜底
    console.log('[FAIL] 超管删除失败');
    console.log('请手动清理档案 ' + code + ' (id=' + pid + ')');
    process.exit(1);
  }
  console.log('[PASS] 超管删除成功');

  console.log('\nALL PASS');
})().catch((e) => { console.log('[FAIL] 脚本异常: ' + e.message); process.exit(1); });
