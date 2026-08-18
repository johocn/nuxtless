// 临时脚本：从部署的 Shop API 拉取 introspection schema 覆盖 graphql.schema.json
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIntrospectionQuery } from 'graphql';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const envPath = resolve(root, '.env');
const env = { ...process.env };
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  if (!(k in env)) env[k] = v;
}

const url = env.GQL_HOST;
const token = env.CHANNEL_TOKEN;
if (!url || !token) {
  console.error('缺少 GQL_HOST 或 CHANNEL_TOKEN');
  process.exit(1);
}
console.log('introspect:', url);

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'vendure-channel-token': token,
  },
  body: JSON.stringify({ query: getIntrospectionQuery({ descriptions: true }) }),
});
const json = await res.json();
if (json.errors) {
  console.error('introspection errors:', JSON.stringify(json.errors, null, 2).slice(0, 2000));
  process.exit(1);
}
// codegen 不需要 directives；且自定义指令 locations 含 DIRECTIVE_DEFINITION 会导致 graphql-codegen SDL 重解析失败
delete json.data.__schema.directives;
writeFileSync(resolve(root, 'graphql.schema.json'), JSON.stringify(json.data, null, 2), 'utf8');
console.log('written graphql.schema.json, size:', (json.data ? Buffer.byteLength(JSON.stringify(json.data)) : 0));
