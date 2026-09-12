#!/usr/bin/env node
/**
 * 验证租户管理员能否访问配送档案 query（ShippingProfile 权限是否生效）。
 * 用法：node tmp/verify-tenant-admin-shipping-profile.mjs
 */
const BASE = process.env.WA_API || 'https://e.joho.cn/admin-api';
const USER = process.env.TA_USER || 't2admin';
const PASS = process.env.TA_PASS || 'you123123';
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
(async () => {
  const r = await gql(`mutation { login(username:"${USER}", password:"${PASS}"){ ... on CurrentUser { id identifier } ... on InvalidCredentialsError { message } } }`);
  if (!r.token) { console.log(`[FAIL] 登录失败 ${USER}: ` + JSON.stringify(r.body)); process.exit(1); }
  const h = { Authorization: `Bearer ${r.token}` };
  const q = await gql(`query { shippingProfiles(options:{take:10}) { items { id name isGlobal } totalItems } }`, {}, h);
  if (q.body?.errors) {
    console.log(`[FAIL] ${USER} 查询配送档案被拒: ` + JSON.stringify(q.body.errors).slice(0, 300));
    process.exit(1);
  }
  const items = q.body?.data?.shippingProfiles?.items ?? [];
  console.log(`[PASS] ${USER} 可访问配送档案，可见 ${items.length} 个:`);
  for (const it of items) console.log(`   ${it.id}\t${it.name}\tglobal=${it.isGlobal}`);
})();