#!/usr/bin/env node
/** 端到端验证（vendure-token 头）：各渠道下单（档案1商品58）→ orderBoxes 箱自提点 */
const base = 'https://e.joho.cn/shop-api';
const CHANNELS = [
  { name: 'default(1)', token: 'cnx87ezvmjx8nn3bth6c' },
  { name: 't1(7)', token: 'a6fn474hhiqasmyiyrfl' },
  { name: 't2(37)', token: '66ruvnhh34svhckaa2i' },
];
const VARIANT_ID = process.env.VARIANT_ID || '58';
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
    let cookie = '';
    const act = await gql(ch.token, `query { activeChannel { id code } }`, {}, cookie);
    cookie = act.cookie;
    await gql(ch.token, `mutation { removeAllOrderLines { __typename } }`, {}, cookie);
    const add = await gql(ch.token, `mutation { addItemToOrder(productVariantId: ${VARIANT_ID}, quantity: 1) { __typename ... on Order { id code } ... on ErrorResult { errorCode message } } }`, {}, cookie);
    cookie = add.cookie;
    const box = await gql(ch.token, `query { orderBoxes { boxKey profileId profileName type pickupLocations { id name type address } availableShippingMethods { id code } } }`, {}, cookie);
    console.log(`\n########## 渠道 ${ch.name} ##########`);
    console.log('activeChannel:', JSON.stringify(act.j?.data?.activeChannel ?? act.j?.errors));
    console.log('addItemToOrder:', JSON.stringify(add.j?.data?.addItemToOrder ?? add.j?.errors));
    console.log('orderBoxes:', JSON.stringify(box.j?.data?.orderBoxes ?? box.j?.errors, null, 1));
  }
})().catch((e) => console.error('ERR', e.message));
