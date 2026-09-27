#!/usr/bin/env node
/**
 * t2（二月兰）首页装修配置：临时写入 / 还原 shopContent（用于「热门 / 推荐」积木的线上验收）。
 *
 * 遵守仓库数据脚本约定：执行前先备份原值到 d:\zhao\_backup\，只合并 shopContent 一个字段
 * （读回完整 customFields 后合并提交），绝不清掉 detailConfig / shopName 等其它字段。
 *
 * 用法：
 *   node scripts/verify-t2-blocks-config.mjs on-a     # 写入 A(紧凑) + C(一大二小)
 *   node scripts/verify-t2-blocks-config.mjs on-b     # 写入 B(横滑)
 *   node scripts/verify-t2-blocks-config.mjs off      # 还原（清除 shopContent，回到京东兜底楼层）
 *   node scripts/verify-t2-blocks-config.mjs show     # 只读打印当前值
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ADMIN = process.env.WA_API || 'https://e.joho.cn/admin-api';
const TOKEN = process.env.T2_TOKEN || '66ruvnhh34svhckaa2i';
const LOGIN = 'mutation { login(username:"superadmin", password:"z123123") { ... on CurrentUser { id } } }';
const READ_CF = `query { activeChannel { id code customFields { shopContent } } }`;
const WRITE_CF = `mutation ($input: UpdateChannelInput!) {
  updateChannel(input: $input) {
    ... on Channel { id code customFields { shopContent } }
    ... on ErrorResult { errorCode message }
  }
}`;

const mode = process.argv[2];
if (!['on-a', 'on-b', 'off', 'show'].includes(mode)) {
  console.error('用法：node scripts/verify-t2-blocks-config.mjs on-a|on-b|off|show');
  process.exit(1);
}

const CATS = [
  { slug: '休闲娱乐', label: '休闲娱乐' },
  { slug: '养车', label: '养车' },
  { slug: '日常用品', label: '日常用品' },
];
const navSection = {
  type: 'nav',
  shape: 'round',
  layout: 'row',
  items: CATS.map((c) => ({ label: c.label, link: `/category/${c.slug}` })),
};
const sectionSets = {
  'on-a': [
    navSection,
    { type: 'hot', source: 'auto', limit: 4, layout: 'compact' },
    { type: 'recommend', source: 'auto', limit: 3, layout: 'hero', dedupe: true },
  ],
  'on-b': [navSection, { type: 'hot', source: 'auto', limit: 6, layout: 'sliding' }],
  off: null,
};

async function gql(query, variables, auth) {
  const res = await fetch(ADMIN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      'vendure-token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  return { body, token: res.headers.get('vendure-auth-token') };
}

(async () => {
  const login = await gql(LOGIN);
  const auth = login.token;
  if (!auth) {
    console.error('登录失败', JSON.stringify(login.body));
    process.exit(1);
  }

  const cur = await gql(READ_CF, {}, auth);
  if (cur.body?.errors) {
    console.error('读取失败', JSON.stringify(cur.body.errors));
    process.exit(1);
  }
  const channelId = cur.body.data.activeChannel.id;
  const before = cur.body.data.activeChannel.customFields?.shopContent ?? null;
  console.log(`渠道 id=${channelId}`);
  console.log(`改前 shopContent = ${before === null ? 'null' : `${String(before).length} chars`}`);

  if (mode === 'show') return;

  // 备份（含改前原文）
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13).replace(/(\d{8})(\d{2})/, '$1-$2');
  const dir = resolve(`d:/zhao/_backup/t2-shopcontent-${stamp}`);
  mkdirSync(dir, { recursive: true });
  const backupPath = resolve(dir, 'backup.json');
  writeFileSync(backupPath, JSON.stringify({ channelId, before, mode, at: new Date().toISOString() }, null, 2));
  console.log(`备份 → ${backupPath}`);

  const shopContent = sectionSets[mode] ? JSON.stringify({ version: 1, sections: sectionSets[mode] }) : null;
  const written = await gql(WRITE_CF, { input: { id: channelId, customFields: { shopContent } } }, auth);
  if (written.body?.errors) {
    console.error('写入失败', JSON.stringify(written.body.errors));
    process.exit(1);
  }

  // 读回复核：确认 shopContent 生效且其它字段未动
  const after = await gql(READ_CF, {}, auth);
  console.log(`改后 shopContent = ${after.body.data.activeChannel.customFields?.shopContent ?? 'null'}`);
  console.log(`模式=${mode}；如需还原：node scripts/verify-t2-blocks-config.mjs off`);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
