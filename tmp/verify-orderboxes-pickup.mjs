#!/usr/bin/env node
/** 端到端验证：默认渠道下单（档案1商品）→ orderBoxes 箱自提点应为「国信南山温泉酒店」仅1个 */
const base = 'https://e.joho.cn/shop-api';
const CH = process.env.CHANNEL_TOKEN || 'abc123xyz';
const VARIANT_ID = process.env.VARIANT_ID || '58';

let cookie = '';
const gql = async (q, v) => {
  const headers = { 'Content-Type': 'application/json', 'vendure-channel-token': CH };
  if (cookie) headers['Cookie'] = cookie;
  const r = await fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: q, variables: v }),
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) {
    cookie = sc.map((c) => c.split(';')[0]).join('; ');
  }
  return { j: await r.json() };
};

(async () => {
  const add = await gql(`mutation { addItemToOrder(productVariantId: ${VARIANT_ID}, quantity: 1) { __typename ... on Order { id code } ... on ErrorResult { errorCode message } } }`);
  console.log('addItemToOrder:', JSON.stringify(add.j?.data?.addItemToOrder ?? add.j?.errors));

  const box = await gql(`query { orderBoxes { boxKey profileId profileName type pickupLocations { id name type address } availableShippingMethods { id code name } } }`);
  console.log('\norderBoxes:', JSON.stringify(box.j?.data?.orderBoxes ?? box.j?.errors, null, 1));
})().catch((e) => console.error('ERR', e.message));
