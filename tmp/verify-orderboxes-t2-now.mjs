#!/usr/bin/env node
/** 实测 C 端 orderBoxes：t2 与 default 渠道，variant 58 */
const BASE = 'https://www.youshop.cn/shop-api';
const CHANNELS = [
  { name: 'default(1)', token: 'cnx87ezvmjx8nn3bth6c' },
  { name: 't2(37)', token: '66ruvnhh34svhckaa2i' },
];
let cookie = '';
const gql = async (q, vars = {}, headers = {}) => {
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  return { j: await res.json() };
};
(async () => {
  for (const ch of CHANNELS) {
    cookie = '';
    const h = { 'vendure-channel-token': ch.token };
    console.log(`\n########## C端 ${ch.name} ##########`);
    const add = await gql(`mutation { addItemToOrder(productVariantId: 58, quantity: 1) { __typename ... on Order { id code } ... on ErrorResult { errorCode message } } }`, {}, h);
    console.log('addItem:', JSON.stringify(add.j?.data?.addItemToOrder));
    const box = await gql(`query { orderBoxes {
      boxKey profileId profileName type
      pickupLocations { id name type }
      availableShippingMethods { id code name }
    } }`, {}, h);
    const boxes = box.j?.data?.orderBoxes;
    if (!boxes) { console.log('errors:', JSON.stringify(box.j?.errors)); continue; }
    for (const b of boxes) {
      console.log(`箱 ${b.profileId} ${b.profileName} type=${b.type}`);
      console.log(`  自提点: ${(b.pickupLocations || []).map(p => `${p.id}:${p.name}:${p.type}`).join(' | ') || '(无)'}`);
      console.log(`  方式: ${(b.availableShippingMethods || []).map(m => `${m.id}:${m.code}`).join(' | ') || '(无)'}`);
    }
    // 清空购物车
    await gql(`mutation { removeAllOrderLines { __typename ... on Order { id } } }`, {}, h);
  }
})().catch((e) => console.error('ERR', e.message));
