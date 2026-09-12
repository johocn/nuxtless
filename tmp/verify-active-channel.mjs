#!/usr/bin/env node
/** 验证：shop-api 各渠道 activeChannel 上下文 + orderBoxes 行为 */
const base = 'https://e.joho.cn/shop-api';
const CHANNELS = [
  { name: 'default', token: 'cnx87ezvmjx8nn3bth6c' },
  { name: 't1(7)', token: 'a6fn474hhiqasmyiyrfl' },
  { name: 't2(37)', token: '66ruvnhh34svhckaa2i' },
];
const gql = async (CH, q, v, cookie) => {
  const headers = { 'Content-Type': 'application/json', 'vendure-channel-token': CH };
  if (cookie) headers['Cookie'] = cookie;
  const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: v }) });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  let next = cookie;
  if (sc.length) next = sc.map((c) => c.split(';')[0]).join('; ');
  return { j: await r.json(), cookie: next };
};
(async () => {
  for (const ch of CHANNELS) {
    const ac = await gql(ch.token, `query { activeChannel { id code token } }`);
    console.log(`\n########## 渠道 ${ch.name} ##########`);
    console.log('activeChannel:', JSON.stringify(ac.j?.data?.activeChannel ?? ac.j?.errors));
  }
})().catch((e) => console.error('ERR', e.message));
