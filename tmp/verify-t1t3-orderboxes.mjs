#!/usr/bin/env node
/** 端到端验证：t1(变体48)/t3(变体47) 渠道 orderBoxes 门店自提箱可见性（应只含全局点 1，过滤 t2 私有点 13） */
const base = 'https://e.joho.cn/shop-api';
const CHANNELS = [
  { name: 't1(7)', token: 'a6fn474hhiqasmyiyrfl', variant: 48 },
  { name: 't3(38)', token: '', variant: 47 },
];
const t3Token = process.env.T3_TOKEN || '';
if (t3Token) CHANNELS[1].token = t3Token;

const gql = async (CH, q, v, cookie) => {
  const headers = { 'Content-Type': 'application/json', 'vendure-token': CH };
  if (cookie) headers['Cookie'] = cookie;
  const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  let next = cookie;
  if (sc.length) next = sc.map((c) => c.split(';')[0]).join('; ');
  return { j: await r.json(), cookie: next };
};
(async () => {
  for (const ch of CHANNELS) {
    if (!ch.token) { console.log(`\n########## ${ch.name} 跳过（无 token）##########`); continue; }
    let cookie = '';
    const act = await gql(ch.token, `query { activeOrder { id } }`, {}, cookie);
    if (act.j?.data?.activeOrder?.id) {
      await gql(ch.token, `mutation { removeAllOrderLines }`, {}, cookie);
    }
    const add = await gql(ch.token, `mutation { addItemToOrder(productVariantId: ${ch.variant}, quantity: 1) { __typename ... on Order { id code } ... on ErrorResult { errorCode message } } }`, {}, cookie);
    cookie = add.cookie;
    const box = await gql(ch.token, `query { orderBoxes { boxKey profileId profileName type pickupLocations { id name type address } } }`, {}, cookie);
    console.log(`\n########## 渠道 ${ch.name} ##########`);
    console.log('addItemToOrder:', JSON.stringify(add.j?.data?.addItemToOrder ?? add.j?.errors));
    console.log('orderBoxes:', JSON.stringify(box.j?.data?.orderBoxes ?? box.j?.errors, null, 1));
  }
})().catch((e) => console.error('ERR', e.message));
