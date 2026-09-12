#!/usr/bin/env node
/** 验证：admin API 各渠道 pickupLocations 候选池 + pickupLocation(id) */
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
    const r = await gql(`query {
      pickupLocations(options: { take: 100, skip: 0 }) {
        items { id name type isPublic enabled city }
        totalItems
      }
    }`, {}, h);
    console.log(`\n########## 渠道 ${ch.name} pickupLocations ##########`);
    const items = r.body?.data?.pickupLocations?.items;
    if (!items) { console.log(JSON.stringify(r.body?.errors)); continue; }
    console.log(JSON.stringify(items.map(p => `${p.id}:${p.name}:${p.type}:public=${p.isPublic}:enabled=${p.enabled}:city=${p.city ?? ''}`)));
  }
})().catch((e) => console.error('ERR', e.message));
