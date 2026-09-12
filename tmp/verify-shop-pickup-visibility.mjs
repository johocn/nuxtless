#!/usr/bin/env node
/** 端到端验证：shop-api pickupLocations(type) 各渠道可见性（store 类型） */
const base = 'https://e.joho.cn/shop-api';
const CHANNELS = [
  { name: 'default', token: 'cnx87ezvmjx8nn3bth6c' },
  { name: 't1(7)', token: 'a6fn474hhiqasmyiyrfl' },
  { name: 't2(37)', token: '66ruvnhh34svhckaa2i' },
];
const gql = async (CH, q) => {
  const r = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'vendure-token': CH },
    body: JSON.stringify({ query: q }),
  });
  return r.json();
};
(async () => {
  for (const ch of CHANNELS) {
    const r = await gql(ch.token, `query { pickupLocations(type: "store") { id name type isPublic } }`);
    console.log(`\n########## 渠道 ${ch.name} store 自提点 ##########`);
    console.log(JSON.stringify(r?.data?.pickupLocations ?? r?.errors));
  }
})().catch((e) => console.error('ERR', e.message));
