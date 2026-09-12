#!/usr/bin/env node
/** 运营后台（admin-api）验证：superadmin 在各渠道上下文看到的配送档案/自提点 */
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
        items { id code name isGlobal enabled isTenantDefault
          pickupLocations { id name type }
          methodConfigs { shippingMethodId mode options }
        }
        totalItems
      }
    }`, {}, h);
    const pickups = await gql(`query { pickupLocations(options: { take: 100 }) { items { id name type isPublic } totalItems } }`, {}, h);
    console.log(`\n########## 渠道 ${ch.name} ##########`);
    console.log('shippingProfiles:', JSON.stringify(profiles.body?.data?.shippingProfiles ?? profiles.body?.errors, null, 1));
    console.log('pickupLocations:', JSON.stringify(pickups.body?.data?.pickupLocations ?? pickups.body?.errors, null, 1));
  }
})().catch((e) => console.error('ERR', e.message));
