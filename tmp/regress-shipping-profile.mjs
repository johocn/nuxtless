#!/usr/bin/env node
// 配送档案领域一键回归：档案可见性 / 全局权限 / 租户管理员角色权限 / 档案1绑定一致性
import { gql, hAdmin, loginAs, Regress, T2_TOKEN, DEFAULT_TOKEN } from './lib/regress-helpers.mjs';

(async () => {
  const auth = await loginAs();
  const r = new Regress('shipping-profile');

  // 组 1：档案可见性（平台含全局档案；t2 渠道可见全局档案）
  const vis = await gql(`query { shippingProfiles(options:{take:100}) { items { id name isGlobal } } }`, {}, hAdmin(auth, DEFAULT_TOKEN));
  const items = vis.body?.data?.shippingProfiles?.items ?? [];
  r.assert('平台渠道可查配送档案', items.length > 0, JSON.stringify(vis.body?.errors));
  r.assert('平台渠道可见全局档案', items.some((p) => p.isGlobal === true));

  const visT2 = await gql(`query { shippingProfiles(options:{take:100}) { items { id name isGlobal } } }`, {}, hAdmin(auth, T2_TOKEN));
  const itemsT2 = visT2.body?.data?.shippingProfiles?.items ?? [];
  r.assert('t2 渠道可查配送档案', itemsT2.length > 0, JSON.stringify(visT2.body?.errors));

  // 组 2：全局档案权限（超管在 t2 建全局 → isTenantDefault=false → 删除，自清理）
  const mres = await gql(`query { shippingMethods(options:{take:20}) { items { id } } }`, {}, hAdmin(auth));
  const methodId = mres.body?.data?.shippingMethods?.items?.[0]?.id;
  r.assert('取到配送方式 id', !!methodId, JSON.stringify(mres.body?.errors));
  let createdId = '';
  if (methodId) {
    const ts = Date.now();
    const c = await gql(
      `mutation($i:CreateShippingProfileInput!){ createShippingProfile(input:$i){ id isGlobal isTenantDefault } }`,
      { i: { name: '回归全局' + ts, code: 'rgl' + ts, description: '', isGlobal: true, shippingMethodIds: [methodId] } },
      hAdmin(auth, T2_TOKEN)
    );
    const p = c.body?.data?.createShippingProfile;
    r.assert('超管创建全局档案', p?.isGlobal === true, JSON.stringify(c.body?.errors));
    r.assert('全局档案 isTenantDefault=false', p?.isTenantDefault === false, JSON.stringify(p));
    createdId = p?.id ?? '';
    if (createdId) {
      const d = await gql(`mutation($id:ID!){ deleteShippingProfile(id:$id) }`, { id: createdId }, hAdmin(auth, T2_TOKEN));
      r.assert('超管删除全局档案', !d.body?.errors, JSON.stringify(d.body?.errors));
    }
  }

  // 组 3：所有租户管理员角色均含 ShippingProfile（覆盖 2026-09-12 权限回填）
  const roles = await gql(`query { roles(options:{take:300}) { items { id code permissions } } }`, {}, hAdmin(auth));
  const tenants = (roles.body?.data?.roles?.items ?? []).filter((x) => /tenant-admin/i.test(x.code));
  r.assert('存在租户管理员角色', tenants.length > 0, '无 tenant-admin 角色');
  const missing = tenants.filter((t) => !(t.permissions || []).includes('ShippingProfile'));
  r.assert(`全部 ${tenants.length} 个租户管理员含 ShippingProfile`, missing.length === 0,
    missing.map((m) => m.code).join(','));

  // 组 4：档案 1（门店自提）绑定一致性：methodConfigs.options.pickupLocationIds 均为真实自提点
  const bind = await gql(`query { shippingProfiles(options:{take:50}) { items { id methodConfigs { shippingMethodId mode options } } } }`, {}, hAdmin(auth, DEFAULT_TOKEN));
  const prof1 = (bind.body?.data?.shippingProfiles?.items ?? []).find((p) => p.id === '1');
  if (prof1?.methodConfigs?.length) {
    const ids = prof1.methodConfigs.flatMap((c) => c.options?.pickupLocationIds ?? []);
    r.assert('档案1方式配置存在 pickupLocationIds', ids.length > 0, JSON.stringify(prof1.methodConfigs));
  } else {
    r.skip('档案1方式配置为空，跳过绑定一致性');
  }

  process.exit(r.summary() ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
