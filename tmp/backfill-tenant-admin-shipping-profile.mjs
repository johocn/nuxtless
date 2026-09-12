#!/usr/bin/env node
/**
 * 批量给全部「租户管理员」角色补 ShippingProfile 权限（2026-09-12 权限目录扩容后的存量回填）。
 * 幂等：已含 ShippingProfile 的角色跳过。
 * 用法：node tmp/backfill-tenant-admin-shipping-profile.mjs [--apply]
 *   不带 --apply：dry-run，只打印将要更新的角色清单；
 *   带 --apply：真正执行 updateTenantRole 回填。
 */
const BASE = process.env.WA_API || 'https://e.joho.cn/admin-api';
const APPLY = process.argv.includes('--apply');
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
  const r = await gql(`mutation { login(username:"superadmin", password:"z123123"){ ... on CurrentUser { id identifier } ... on InvalidCredentialsError { message } } }`);
  if (!r.token) throw new Error('login failed ' + JSON.stringify(r.body));
  auth = r.token;
  const h = { Authorization: `Bearer ${auth}` };

  const rolesRes = await gql(`query { roles { items { id code permissions } } }`, {}, h);
  const roles = rolesRes.body?.data?.roles?.items ?? [];
  if (!roles.length) throw new Error('no roles ' + JSON.stringify(rolesRes.body));

  const targets = roles.filter((x) => /tenant-admin/i.test(x.code));
  console.log(`共 ${roles.length} 个角色，命中租户管理员 ${targets.length} 个（code 含 tenant-admin）`);
  console.log('目标角色清单：');
  for (const t of targets) {
    const has = (t.permissions || []).includes('ShippingProfile');
    console.log(`  ${t.id}\t${t.code}\t${has ? '已含[SKIP]' : '缺 ShippingProfile[需补]'}`);
  }

  if (!APPLY) {
    console.log('\n[dry-run] 未加 --apply，不执行更新。加 --apply 执行回填。');
    process.exit(0);
  }

  console.log('\n执行回填：');
  let ok = 0, skip = 0, fail = 0;
  // 白名单：业务权限全集（含 ShippingProfile）。Authenticated/ManageOwnShop 等系统/历史权限
  // 不在 BUSINESS_PERMISSIONS 内，updateTenantRole 会拒绝；Authenticated 由 RoleService.update 自动补回。
  const whitelist = [
    'ReadCatalog','CreateCatalog','UpdateCatalog','DeleteCatalog',
    'ReadProduct','CreateProduct','UpdateProduct','DeleteProduct',
    'ReadCollection','CreateCollection','UpdateCollection','DeleteCollection',
    'ReadOrder','UpdateOrder','CreateOrder',
    'ReadAsset','CreateAsset','UpdateAsset','DeleteAsset',
    'ReadShippingMethod','CreateShippingMethod','UpdateShippingMethod','DeleteShippingMethod',
    'ShippingProfile',
    'ReadPaymentMethod','CreatePaymentMethod','UpdatePaymentMethod','DeletePaymentMethod',
    'TenantRoleManage','TenantMemberManage','VerifyOrder',
  ];
  for (const t of targets) {
    const perms = (t.permissions || []).filter((x) => whitelist.includes(x));
    if (perms.includes('ShippingProfile')) { skip++; console.log(`  [SKIP] ${t.code}`); continue; }
    const next = [...perms, 'ShippingProfile'];
    const up = await gql(
      `mutation($roleId: ID!, $input: UpdateTenantRoleInput!) { updateTenantRole(roleId: $roleId, input: $input) { id code } }`,
      { roleId: t.id, input: { permissions: next } },
      h,
    );
    if (up.body?.errors) {
      fail++;
      console.log(`  [FAIL] ${t.code}: ${JSON.stringify(up.body.errors).slice(0, 200)}`);
    } else {
      ok++;
      console.log(`  [OK] ${t.code} -> ${next.length} 项权限(含 ShippingProfile)`);
    }
  }
  console.log(`\n完成：成功 ${ok}，跳过 ${skip}，失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
