# 配送档案「全局化」管理：设为全局开关 + 全局徽标 + 后端权限锁定 设计

日期：2026-09-12
范围：web-admin 配送档案管理页（`vshop/web-admin/src/pages/shipping/profile/index.vue`）+ Vendure cjk-plugin 配送档案服务（`shipping-profile.service.ts`）
状态：已审阅（徽标样式 A；超管可在编辑时开关全局），待实现

## 背景与问题

配送档案已有 `isGlobal` 字段（全局档案 `isGlobal=true` 由超管维护、任意租户可见；租户级档案 `isGlobal=false` 仅所属租户可见，见 `2026-08-28-nshop-delivery-payment-splitting-design.md` §2.2），API 层也已透传（`ShippingProfileInput.isGlobal`），但运营后台存在三处缺口：

1. **创建表单没有「设为全局」开关**：超管无法在界面上创建全局档案，只能靠后端/数据库直改。
2. **列表不标注全局档案**：全局档案与租户档案混排，无法区分。
3. **后端权限不对称（安全缺口）**：
   - `create()` 对 `isGlobal=true` 无超管校验，任何有配送档案权限的管理员都能创建全局档案；
   - `update()` 仅在「档案已是全局且当前非超管」时拦截，非超管仍可通过编辑把自有档案**升格为全局**；
   - `delete()` 对全局档案无任何校验，租户管理员可直接调 API 删除全局档案。

## 目标

- 超管可在**创建表单**设置「设为全局」，也可在**任意租户的配送档案编辑页开关全局属性**（开 → 全局可见；关 → 归属当前操作租户）。
- 非超管（租户管理员）对全局档案**只读**：隐藏启停开关与编辑/删除/设为默认入口，后端同步强制。
- 列表对全局档案加「全局」徽标（**样式 A：品牌紫实心白字**）。
- 后端补齐 create / update / delete 权限校验，并保证 `ownerChannelId` / `isTenantDefault` 与 `isGlobal` 变更保持一致（不产生脏数据）。

## 设计

### ① 新建表单（超管视角）

- 在「设为租户默认」上方新增**「设为全局」开关行**，仅超管可见（`authStore.isSuperAdmin`，即 `access.isSuperAdmin === true || username === 'superadmin'`），默认关闭。
- 开启后显示提示文案：**「全局档案对所有租户可见，仅超管可维护」**。
- `onSave` 时把 `form.isGlobal` 传入 `createShippingProfile`（API 已支持）。
- **互斥规则**：开启「设为全局」时，「设为租户默认」自动置灰并置为关闭（后端 `setTenantDefaultShippingProfile` 本就会拒绝全局档案，前端先行避免保存后报错）。
- 非超管不渲染该行，也不发送 `isGlobal`。

### ② 编辑表单（超管可切换全局）

- 超管通过后台渠道切换（既有能力，`authStore.channels` / `tenantStore`）进入**各租户**的配送档案页；编辑其中任一档案时，「设为全局」为**可操作开关**：
  - **开 → 全局**：对所有租户可见；后端置 `ownerChannelId=null` 并**自动取消租户默认**（全局档案不能是租户默认）。
  - **关 → 租户**：归属当前操作租户（`ctx.channelId`），仅该租户可见。
- **开启前弹确认**：「开启后所有租户可见，确认？」；若该档案当前是租户默认，提示将自动取消租户默认。
- 非超管：开关**只读锁定**展示（「全局档案」标签 + 置灰开关 + 说明「仅超管可维护」），全局档案的编辑入口在列表已隐藏，后端亦强制拒绝。

### ③ 列表展示

- 全局档案卡片在名称旁加**「全局」徽标**（样式 A：品牌紫实心白字，圆角胶囊，与现有「默认」「停用」徽标并列）。
- 非超管视角：全局档案卡片的**启停开关、编辑/删除/设为默认全部隐藏**，底部显示「仅超管可维护 · 不可编辑」；本租户自有档案操作保持不变。
- 超管视角：全局档案卡片操作入口完整（编辑走 ② 的可切换表单）。

### ④ 后端权限与字段一致性（shipping-profile.service.ts）

- **create**：`input.isGlobal === true` 且当前用户非 SuperAdmin → 抛错 `仅超级管理员可创建全局档案`。
- **update**：
  - 非超管：沿用既有拦截（全局档案内容不可改）；**`isGlobal` 变更一律拒绝**（抛错 `仅超级管理员可修改全局属性`）。
  - 超管：允许改 `isGlobal`，变更时自动维护关联字段：
    - `isGlobal: true` → `ownerChannelId = null`、`isTenantDefault = false`；
    - `isGlobal: false` → `ownerChannelId = ctx.channelId`。
- **delete**：档案 `isGlobal === true` 且当前用户非 SuperAdmin → 抛错 `仅超级管理员可删除全局档案`。
- 既有规则保持不变：全局档案不能设为租户默认。
- **风险说明**：档案转全局后，其绑定的**租户私有自提点对其他租户仍不可见**（C 端按「全局 + 本租户」可见性过滤，不会泄露）；已跨租户绑定的商品如需调整，由超管自行重绑。

## 涉及文件

- 改 `vshop/web-admin/src/pages/shipping/profile/index.vue`：新建表单全局开关 + 互斥、编辑表单可切换 + 确认弹窗、列表全局徽标（样式 A）、非超管只读隐藏操作。
- 改 `vendure/packages/cjk-plugin/src/shipping/shipping-profile.service.ts`：create/update/delete 三处权限校验 + update 切换时的字段一致性维护。
- API 层无需改动（`ShippingProfileInput.isGlobal` / `ShippingProfileItem.isGlobal` 已存在）。

## 测试与交付

- 后端用例：
  - 非超管 create 传 `isGlobal:true` → 拒绝；
  - 超管 update 开全局 → `ownerChannelId=null` 且 `isTenantDefault=false`；
  - 超管 update 关全局 → `ownerChannelId=当前渠道`；
  - 非超管 update 携带 `isGlobal` 变更 → 拒绝；
  - 非超管 delete 全局档案 → 拒绝。
- 手机视口截图（390×844，dpr=2）：
  - 超管新建表单含「设为全局」开关（开启态 + 互斥置灰）；
  - 超管编辑表单开关两态（开/关）+ 开启前确认弹窗；
  - 列表全局徽标（样式 A）；
  - 租户管理员视角全局档案只读卡片（无操作入口）；
  - 补入操作手册。
- 数据层不改动。

## 决策记录

1. 「设为全局」仅**超管**可操作：新建时可设，编辑时可在任意租户页面开关；非超管任何途径（UI/API）不可。
2. 全局切换自动维护 `ownerChannelId` 与 `isTenantDefault`，避免脏数据（开全局 = 归属 null / 非租户默认；关全局 = 归属当前渠道）。
3. 非超管对全局档案**只读**：UI 隐藏操作入口 + 后端 create/update/delete 三处强制校验，保证 UI 与 API 一致。
4. 徽标采用**样式 A（品牌紫实心白字）**。
5. 开启「设为全局」时「设为租户默认」置灰互斥；编辑态开启全局前弹确认。
