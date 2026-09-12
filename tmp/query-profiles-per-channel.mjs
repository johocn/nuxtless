#!/usr/bin/env node
/** 查询各渠道上下文可见的配送档案（含 boundPickupLocations + methodConfigs） */
const BASE = 'https://e.joho.cn/admin-api';
const CHANNELS = [
  { name: 'default(1)', token: 'cnx87ezvmjx8nn3bth6c' },
  { name: 't1(7)', token: 'a6fn474hhiqasmyiyrfl' },
  { name: 't2(37)', token: '66ruvnhh34svhckaa2i' },
];
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
  for (const ch of CHANNELS) {
    const h = { Authorization: `Bearer ${auth}`, 'vendure-token': ch.token };
    const r = await gql(`query {
      shippingProfiles {
        items {
          id name code isGlobal enabled isTenantDefault requiresAddress requiresContact
          shippingMethods { id code name }
          pickupLocations { id }
          boundPickupLocations { id name type }
          methodConfigs { shippingMethodId mode options }
        }
        totalItems
      }
    }`, {}, h);
    console.log(`\n########## 渠道 ${ch.name} 可见配送档案 ##########`);
    const items = r.body?.data?.shippingProfiles?.items;
    if (!items) { console.log(JSON.stringify(r.body?.errors)); continue; }
    for (const s of items) {
      const opts = (s.methodConfigs || []).map(c => `${c.shippingMethodId}:${c.mode}:${JSON.stringify(c.options)}`).join('; ');
      const bound = (s.boundPickupLocations || []).map(p => `${p.id}:${p.name}:${p.type}`).join(', ');
      console.log(`档案${s.id} ${s.name}(${s.code}) global=${s.isGlobal} enabled=${s.enabled} tenantDefault=${s.isTenantDefault} addr=${s.requiresAddress} contact=${s.requiresContact}`);
      console.log(`  方式: ${(s.shippingMethods || []).map(m => `${m.id}:${m.code}`).join(', ') || '(无)'}`);
      console.log(`  methodConfigs: ${opts || '(无)'}`);
      console.log(`  boundPickupLocations: ${bound || '(无)'}`);
    }
  }
})().catch((e) => console.error('ERR', e.message));
