# 结算/账号「默认配送地址」还原与切换修复 —— 设计文档

**日期**：2026-08-31
**状态**：已获用户确认方案方向（含 updateAddress 默认标记闭环）

## 背景与问题

结算页"配送至/地址区块"两处异常：
1. **已设置默认地址不显示**——用户设了默认地址，结算页/账号页却展示错误的地址。
2. **其他地址不能切换/混乱**——切换选择器基于错误的排序与选中态；账号页也无法把"默认"改到其他地址。

### 根因（已实证）

- `useAddressBook` 将 `addresses[0]` 当作默认地址，注释声称"Vendure 无重排 API：默认地址 = addresses 首条"。**该假设不成立**：Vendure `activeCustomer.addresses` 按创建顺序返回，不保证默认在前。
- `GetCustomerAddresses` 查询**未取 `defaultShippingAddress` 字段**，前端无从判断谁是默认。
- `AddressFormModal` **无"设为默认"开关**，新增/编辑地址时 `defaultShippingAddress` 恒为 `false`。
- `useAddressBook.updateAddress` 不传 `defaultShippingAddress`，账号页无法修改默认。

实证（测试账号 `split-e2e-a`，建第 2 个地址为默认）：
```
[0] id=3 张三  default=false   ← 前端会当“默认”
[1] id=4 李四  default=true    ← 真正的默认
```

## 方案

在**前端地址数据层**修复默认地址解析与闭环，结算页/账号页/切换器共享受益。后端无改动。

### 数据流改动

1. **查询取默认字段**
   `layers/base/gql/queries/customer.gql` → `GetCustomerAddresses` 的 `addresses{...}` 增加 `defaultShippingAddress`。

2. **类型透出**
   `types/address.ts`：
   - `AddressRecord` 增加 `defaultShippingAddress: boolean;`。
   - `AddressDraft.isDefault?: boolean` 已有，保持不变。

3. **地址本默认重排 + 写回闭环**
   `layers/base/app/composables/useAddressBook.ts`：
   - `toRecord`：`defaultShippingAddress: Boolean(a.defaultShippingAddress)`。
   - `fetchAddresses`：映射后**稳定排序默认在前**：
     `addresses.value = [...list].sort((x, y) => Number(y.defaultShippingAddress) - Number(x.defaultShippingAddress));`
     → `defaultAddress = addresses[0]` 才成立（两处页面、切换器自动正确）。
   - `updateAddress`：input 增加 `defaultShippingAddress: d.isDefault === true`。
   - `recordToDraft`：增加 `isDefault: r.defaultShippingAddress === true`（编辑弹窗能回显默认开关）。

4. **弹窗默认开关闭环**
   `layers/base/app/components/address/AddressFormModal.vue`：
   - valibot `schema` 增加 `isDefault: optional(boolean())`。
   - `state` 初始与 `draft` watch 均加入 `isDefault: !!draft?.isDefault`。
   - 模板在电话字段后加「设为默认」开关 `USwitch v-model="state.isDefault"`。
   - 提交 `emit("submit", { ...event.data })` 已透传，`isDefault` 随之流入 `createAddress/updateAddress`。

5. **切换选择器选中态**
   `layers/base/app/components/address/AddressPicker.vue`：
   - 用 `watch` 使 `selectedId` 随 `default-id`（现在即真实默认）预选中，下拉首项即当前默认，切换更清晰。

6. **结算地址块**
   `layers/base/app/components/checkout/AddressBlock.vue`：无需改动——`onMounted` 取 `list[0]` 在 reorder 后即真实默认。

### 验收（手机视口 + 后端回环）
- 账号页：新增 2 个地址、将第 2 个勾选默认后保存（含编辑回显），列表默认在前。
- 结算页（物流箱）：进入自动展示"真正的默认地址"，点"切换地址"可在多地址间切换且默认项高亮。

## 非目标 / 范围
- 不改后端（Vendure 重排、排序均在前端完成）。
- 门店自提、分箱多配送组逻辑不涉及。
- 不改移动端其它地址相关 UI 风格。

## 影响文件清单
- Modify: `layers/base/gql/queries/customer.gql`
- Modify: `types/address.ts`
- Modify: `layers/base/app/composables/useAddressBook.ts`
- Modify: `layers/base/app/components/address/AddressFormModal.vue`
- Modify: `layers/base/app/components/address/AddressPicker.vue`