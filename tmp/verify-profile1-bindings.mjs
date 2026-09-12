#!/usr/bin/env node
/** 验证：admin API 默认渠道下 门店自提配送档案(1) 的 methodConfigs options + boundPickupLocations */
const BASE = 'https://e.joho.cn/admin-api';
const CH = 'cnx87ezvmjx8nn3bth6c'; // __default_channel__
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
(async () => {
  const login = await gql(`mutation { login(username:"superadmin", password:"z123123") {
    ... on CurrentUser { id identifier } ... on InvalidCredentialsError { errorCode message } } }`);
  if (!login.token) { console.error('login failed', JSON.stringify(login.body)); return; }
  auth = login.token;
  const h = { Authorization: `Bearer ${auth}`, 'vendure-token': CH };
  const r = await gql(`query {
    shippingProfiles { items { id name code
      boundPickupLocations { id name type address isPublic }
      methodConfigs { shippingMethodId mode options }
    } }
  }`, {}, h);
  const items = r.body?.data?.shippingProfiles?.items;
  if (!items) { console.log('errors', JSON.stringify(r.body?.errors)); return; }
  for (const s of items) {
    console.log(`\n== 档案 ${s.id}: ${s.name} (${s.code}) ==`);
    console.log('  boundPickupLocations:', JSON.stringify((s.boundPickupLocations || []).map(p => `${p.id}:${p.name}:${p.type}`)));
    for (const c of s.methodConfigs || []) {
      console.log(`  method ${c.shippingMethodId} mode=${c.mode} options=${JSON.stringify(c.options)}`);
    }
  }
})().catch((e) => console.error('ERR', e.message));
