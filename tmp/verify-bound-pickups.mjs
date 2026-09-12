#!/usr/bin/env node
/** 验证：admin API 各渠道 shippingProfiles 返回 boundPickupLocations */
const BASE = process.env.WA_API || 'https://e.joho.cn/admin-api';
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
  console.log('login OK');
  for (const ch of CHANNELS) {
    const h = { Authorization: `Bearer ${auth}`, 'vendure-token': ch.token };
    const profiles = await gql(`query {
      shippingProfiles {
        items { id code name isGlobal
          boundPickupLocations { id name type isPublic ownerChannelId }
          methodConfigs { shippingMethodId mode options }
        }
        totalItems
      }
    }`, {}, h);
    console.log(`\n########## 渠道 ${ch.name} ##########`);
    const items = profiles.body?.data?.shippingProfiles?.items;
    if (!items) { console.log(JSON.stringify(profiles.body?.errors)); continue; }
    for (const s of items) {
      console.log(`- [${s.id}] ${s.name} (${s.code}) isGlobal=${s.isGlobal}`);
      console.log(`    boundPickupLocations: ${JSON.stringify((s.boundPickupLocations || []).map(p => `${p.id}:${p.name}:${p.type}`))}`);
      console.log(`    methodConfigs: ${JSON.stringify(s.methodConfigs)}`);
    }
  }
})().catch((e) => console.error('ERR', e.message));
