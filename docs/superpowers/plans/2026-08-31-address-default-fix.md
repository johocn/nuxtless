# 默认配送地址还原与切换修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复结算页"配送至"默认地址不显示、其他地址不能切换的问题——基于 Vendre `defaultShippingAddress` 字段在前端按默认排序，并补齐新增/编辑地址的"设为默认"闭环。

**Architecture:** 全部改在前端地址数据层。`GetCustomerAddresses` 增取 `defaultShippingAddress` 字段 → `AddressRecord` 透出该字段 → `useAddressBook` 拉取后稳定重排默认在前（使 `addresses[0]` 即真实默认）→ `AddressFormModal` 加"设为默认"开关、`updateAddress/recordToDraft` 承载默认标记 → `AddressPicker` 预选中真实默认。后端无改动。

**Tech Stack:** Nuxt 3 / nuxt-graphql-client (codegen) / Nuxt UI (USwitch, UModal, USelectMenu) / valibot / Playwright（验收）。

参考 `docs/superpowers/specs/2026-08-31-address-default-fix-design.md`。

---

### Task 1: 查询与类型透出 defaultShippingAddress

**Files:**
- Modify: `layers/base/gql/queries/customer.gql:14-32`（GetCustomerAddresses）
- Modify: `types/address.ts:1-12`（AddressRecord）
- 由 codegen 重新生成 `useGetCustomerAddresses` 返回类型（dev:prepare / build 时自动）

- [ ] **Step 1: 查询加字段**

`layers/base/gql/queries/customer.gql` 的 `GetCustomerAddresses` 中 `addresses { ... }` 内加入 `defaultShippingAddress`（放在 `fullName` 之后），结果如下：

```gql
query GetCustomerAddresses {
  activeCustomer {
    id
    addresses {
      id
      fullName
      defaultShippingAddress
      streetLine1
      streetLine2
      city
      province
      postalCode
      country {
        code
        name
      }
      phoneNumber
    }
  }
}
```

- [ ] **Step 2: 类型加字段**

`types/address.ts` 的 `AddressRecord` 增加布尔字段（放在 `id` 之后）：

```ts
export interface AddressRecord {
  id: string;
  defaultShippingAddress: boolean;
  fullName: string | null;
  streetLine1: string | null;
  streetLine2?: string | null;
  province?: string | null;
  city?: string | null;
  postalCode?: string | null;
  countryCode: string | null;
  countryName: string | null;
  phoneNumber?: string | null;
}
```

- [ ] **Step 3: 重新生成类型**

Run: `cd /d/zhao/nshop; npm run dev:prepare`
Expected: codegen 输出 `useGetCustomerAddresses` 等 Composable，类型含 `defaultShippingAddress`，无报错退出（若 dev 服务器占用 `.nuxt` 有冲突可只 `npx nuxi prepare` 验证 codegen）。

- [ ] **Step 4: Commit**

```bash
git add layers/base/gql/queries/customer.gql types/address.ts
git commit -m "fix(address): 查询与类型透出 defaultShippingAddress"
```

---

### Task 2: useAddressBook 默认重排 + 写回闭环

**Files:**
- Modify: `layers/base/app/composables/useAddressBook.ts:3-16`（toRecord）、`:28-42`（fetchAddresses）、`:70-94`（updateAddress）、`:110-121`（recordToDraft）

- [ ] **Step 1: toRecord 透出默认标记**

`useAddressBook.ts` 的 `toRecord(a: any): AddressRecord` 增加一行：

```ts
function toRecord(a: any): AddressRecord {
  return {
    id: a.id,
    defaultShippingAddress: Boolean(a.defaultShippingAddress),
    fullName: a.fullName ?? null,
    // ...其余不变
  };
}
```

- [ ] **Step 2: fetchAddresses 重排默认在前**

将 `fetchAddresses` 中 `addresses.value = (activeCustomer?.addresses ?? []).map(toRecord);` 替换为（JS sort 稳定，默认项置首、其余保序）：

```ts
const list = (activeCustomer?.addresses ?? []).map(toRecord);
addresses.value = [...list].sort(
  (x, y) => Number(y.defaultShippingAddress) - Number(x.defaultShippingAddress),
);
return addresses.value;
```

- [ ] **Step 3: updateAddress 写回默认标记**

`updateAddress` 的 mutation `input` 增加一行 `defaultShippingAddress: d.isDefault === true,`（放在 `phoneNumber` 之后）：

```ts
async function updateAddress(id: string, d: AddressDraft): Promise<boolean> {
  ...
  await GqlUpdateCustomerAddress({
    input: {
      id,
      fullName: d.fullName,
      streetLine1: d.streetLine1,
      streetLine2: d.streetLine2,
      province: d.province,
      city: d.city,
      postalCode: d.postalCode,
      countryCode: d.countryCode,
      phoneNumber: d.phoneNumber,
      defaultShippingAddress: d.isDefault === true,
    },
  });
  ...
}
```

- [ ] **Step 4: recordToDraft 承载默认标记（编辑回显）**

`recordToDraft` 增加一行 `isDefault: r.defaultShippingAddress === true,`：

```ts
function recordToDraft(r: AddressRecord): AddressDraft {
  return {
    fullName: r.fullName ?? "",
    streetLine1: r.streetLine1 ?? "",
    streetLine2: r.streetLine2 ?? "",
    province: r.province ?? "",
    city: r.city ?? "",
    postalCode: r.postalCode ?? "",
    countryCode: r.countryCode ?? "",
    phoneNumber: r.phoneNumber ?? "",
    isDefault: r.defaultShippingAddress === true,
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add layers/base/app/composables/useAddressBook.ts
git commit -m "fix(address): 默认地址稳定重排在前 + updateAddress 默认标记闭环"
```

---

### Task 3: AddressFormModal 增加「设为默认」开关

**Files:**
- Modify: `layers/base/app/components/address/AddressFormModal.vue`

valid 校验库为 valibot；`addresses.vue` 的 `handleSubmit` 会把 `{ ...event.data }`（含 `isDefault`）交给 `createAddress/updateAddress`，无需改父页面。

- [ ] **Step 1: schema 增加 isDefault**

`AddressFormModal.vue` 的 valibot `schema` 增加可选布尔字段（放在 `phoneNumber` 之后）：

```ts
isDefault: optional(boolean()),
```

并在 `state` 初始对象末尾增加：

```ts
isDefault: false,
```

- [ ] **Step 2: draft 变化时回显 isDefault**

`watch(() => props.draft, ...)` 里填充 `state.value` 的对象末尾增加：

```ts
isDefault: !!draft?.isDefault,
```

- [ ] **Step 3: 模板加开关**

在模板电话字段 `<UFormField name="phoneNumber">...</UFormField>` 之后、`</UForm>` 之前，增加：

```html
<UFormField name="isDefault" class="flex items-center justify-between rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
  <span class="text-sm">{{ t("messages.account.defaultAddress") }}</span>
  <USwitch v-model="state.isDefault" />
</UFormField>
```

> `messages.account.defaultAddress` 为既有词条（"默认地址"），直接复用，无需新增 i18n。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/components/address/AddressFormModal.vue
git commit -m "fix(address): 弹窗增加“设为默认”开关并随提交透传 isDefault"
```

---

### Task 4: AddressPicker 预选中真实默认

**Files:**
- Modify: `layers/base/app/components/address/AddressPicker.vue`

- [ ] **Step 1: 用 watch 按 default-id 预选中**

在 `selectedId = ref<string>()` 声明之后追加（`default-id` 异步传入后把下拉选中态对齐到真实默认；`defaultId` 即 `addresses[0]`，重排后为真实默认）：

```ts
watch(
  () => props.defaultId,
  (id) => {
    if (id && !selectedId.value) selectedId.value = id;
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add layers/base/app/components/address/AddressPicker.vue
git commit -m "fix(address): 切换器预选中真实默认地址"
```

---

### Task 5: 构建 + 回归 + 手机截图交付

**Files:**
- Create: `scripts/_verify_default_addr.py`
- Create: `scripts/shots/checkout06-addr-default.png`（截图产物）

结算页面 `AddressBlock.vue`（`onMounted` 取重排后 `list[0]`）无须改动，此项为验证与交付。

- [ ] **Step 1: 后端回归（数据成因闭环）**

用脚本在测试账号 `split-e2e-a` 上重建地址场景并断言前端口径（重排后 `addresses[0]` 须为 `defaultShippingAddress=true` 的那条）：

```python
# scripts/_verify_default_addr.py
import json, urllib.request, http.cookiejar
CHANNEL_TOKEN = "cnx87ezvmjx8nn3bth6c"; SHOP="https://www.youshop.cn/shop-api"
EMAIL="split-e2e-a@joho.cn"; PASSWORD="Test#Split123"
cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def gql(q,v=None,h=None):
    b=json.dumps({"query":q,"variables":v or {}}).encode()
    r=urllib.request.Request(SHOP,data=b,headers={"Content-Type":"application/json","vendure-channel-token":CHANNEL_TOKEN,**(h or {})})
    with op.open(r,timeout=40) as x: return {k.lower():v for k,v in x.headers.items()},json.load(x)
(lh,_)=gql("mutation($u:String!,$p:String!){ login(username:$u,password:$p){ __typename } }",{"u":EMAIL,"p":PASSWORD})
AUTH=lh.get("vendure-auth-token",""); H={"vendure-channel-token":CHANNEL_TOKEN,"vendure-auth-token":AUTH}
# 清空既有测试地址
for a in gql("query{ activeCustomer{ addresses{ id } } }",h=H)[1]["data"]["activeCustomer"]["addresses"]:
    gql("mutation($id:ID!){ deleteCustomerAddress(id:$id){ success } }",{"id":a["id"]},H)
def mk(street,default):
    return gql("mutation($i:CreateAddressInput!){ createCustomerAddress(input:$i){ id } }",{"i":{"fullName":"张"+street[:1],"streetLine1":street,"city":"上海市","province":"上海","postalCode":"200000","countryCode":"CN","phoneNumber":"13800000000","defaultShippingAddress":default}},H)
mk("第一路1号",False); mk("第二路2号",True)
adr=gql("""query{ activeCustomer{ addresses{ id streetLine1 defaultShippingAddress } } }""",h=H)[1]["data"]["activeCustomer"]["addresses"]
print("后端顺序:",adr)
# 模拟前端稳定重排
front=[*adr]
front.sort(key=lambda a: not a["defaultShippingAddress"])  # True 在前
print("前端排序后 first:",front[0]["streetLine1"])
assert front[0]["defaultShippingAddress"] is True, "默认地址未置首"
print("OK: 默认地址排首位")
```

Run: `python scripts/_verify_default_addr.py`
Expected: 打印后端顺序（默认非必在首），随后 `OK: 默认地址排首位`，断言通过。

- [ ] **Step 2: build 验证**

Run: `cd /d/zhao/nshop; npm run build`
Expected: 退出码 0，无类型/模板阻塞错误。

- [ ] **Step 3: 手机视口结算页截图**

本地 dev（`http://localhost:8080`）已跑，用 Playwright 手机视口 390×844(dpr=2) 以测试账号登录、物流箱场景进入结算页，打开地址块，断言展示的是默认地址并截图：

```python
# 追加到 scripts/_verify_default_addr.py 或新建 _shot_checkout_default.py
# 用 playwright 登录 split-e2e-a -> 加购默认物流商品(如 vid=6 SPK-BT-01 现已被清理回默认) -> /checkout
# 断言地址块展示 streetLine1 == "第二路2号"（默认）; 点“切换地址”，断言下拉默认项高亮
# 截图保存 scripts/shots/checkout06-addr-default.png
```

> 说明：结算需含"物流需地址"箱才显示地址块；可加购默认配送档案商品构造。截图后人工目检：地址卡显示默认地址、切换器默认项带"默认"徽标。

- [ ] **Step 4: 操作手册补充**

将结算页地址默认展示 + 切换截图补充到操作/交付说明（复用既有结算手册章节，路径见交付文档约定）。

- [ ] **Step 5: Commit**

```bash
git add scripts/_verify_default_addr.py scripts/shots/checkout06-addr-default.png
git commit -m "test(address): 默认地址回归与手机截图交付"
```

---

## Self-Review

**Spec 覆盖**：查询加 `defaultShippingAddress`（Task1）、`AddressRecord` 透出（Task1）、`fetchAddresses` 重排默认在前（Task2）、`updateAddress` 写回默认标记（Task2）、弹窗"设为默认"开关（Task3）、`recordToDraft` 回显（Task2 Step4）、`AddressPicker` 预选中（Task4）、验收（Task5）。spec 全部条目均有对应任务。

**占位符扫描**：无 TBD/TODO；每步含完整代码/命令。Task5 Step3 处给出的是描述 + 要点占位（Playwright 具体选择器依赖运行时 DOM），已在脚本说明中明确断言目标与截图路径，非"待办闭环"。

**类型一致性**：`AddressRecord.defaultShippingAddress: boolean`（Task1）与 `toRecord` 返回 `Boolean(a.defaultShippingAddress)`（Task2）一致；`AddressDraft.isDefault?: boolean` 已有，`updateAddress` 用 `d.isDefault === true`、`recordToDraft` 回填一致；`GetCustomerAddresses` 字段与 codegen 生成的 Composable 命名（`useGetCustomerAddresses` / `useGetCustomerAddressesQuery`）沿用既有模式。