# 结算地址区块「国家/省/市/区一行」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 结算页地址表单把「国家 / 省 / 市 / 区」四个下拉放到同一行（`grid-cols-4`，含手机 390px 也强制一行），并将「街道」从独立下拉并入「详细地址」文本框由用户手动填写。

**Architecture:** 仅改结算地址表单组件 `AddressForm.vue` 的模板布局与 `streetLine1` 回填/覆盖逻辑；保留现有高德四级联动 + 逆地理自动填充的数据链（省→市→区、区直挂街道的内部分支仍保留，只改变街道的落点：不再渲染成下拉，而是写入 `streetLine1` 详细地址文本框）。不做后端改动。

**Tech Stack:** Nuxt 3 / Nuxt UI（`UForm`、`UInput`、`USelectMenu`、`UFormField`）/ Tailwind CSS 网格 / Playwright（验收截图）。

---

### Task 1: 布局改版——国家/省/市/区一行，街道并入详细地址

**Files:**
- Modify: `layers/base/app/components/checkout/AddressForm.vue:340-516`（template）
- Modify: `layers/base/app/components/checkout/AddressForm.vue:84-90`（syncState，去掉 streetLine1 覆盖）
- Modify: `layers/base/app/components/checkout/AddressForm.vue:198-225`（preselectByLocation，逆地理填充后预填详细地址）
- Modify: `layers/base/i18n/locales/zh-CN.ts`、`layers/base/i18n/locales/en-US.ts`（详细地址占位文案）

- [ ] **Step 1: 改 template——国家加入省市区网格行，删除街道下拉**

将原「国家（整行独立）」字段与「省/市/区/街道」四级联动块，替换为「国家+省+市+区」的单行 4 格网格（`grid-cols-4`，手机 390px 不拆行）：

```html
    <!-- 国家 / 省 / 市 / 区 显示在一行（4格，含手机 390px 也强制一行） -->
    <div class="col-span-2 grid grid-cols-4 gap-2">
      <UFormField :label="t('messages.billing.country')" name="countryCode" class="w-full" size="xl">
        <USelectMenu
          v-model="state.countryCode"
          value-key="code"
          :items="countries"
          class="w-full min-w-0"
        />
      </UFormField>

      <UFormField :label="t('messages.billing.province')" name="province" class="w-full" size="xl">
        <USelectMenu
          v-model="provinceSel.current"
          :items="provinceSel.items.map((p) => p.name)"
          :disabled="districtsLoading"
          @update:model-value="onProvinceChange"
          class="w-full min-w-0"
        />
      </UFormField>

      <UFormField :label="t('messages.billing.city')" name="city" class="w-full" size="xl">
        <USelectMenu
          v-model="citySel.current"
          :items="citySel.items.map((c) => c.name)"
          :disabled="districtsLoading"
          @update:model-value="onCityChange"
          class="w-full min-w-0"
        />
      </UFormField>

      <UFormField :label="t('messages.billing.district')" name="district" class="w-full" size="xl">
        <USelectMenu
          v-model="districtSel.current"
          :items="districtSel.items.map((d) => d.name)"
          :disabled="districtsLoading"
          @update:model-value="onDistrictChange"
          class="w-full min-w-0"
        />
      </UFormField>
    </div>
    <p v-if="districtsLoading" class="col-span-2 -mt-2 text-xs text-neutral-400">
      {{ t("messages.billing.loadingDistricts") }}
    </p>
```

再给「详细地址」`streetLine1` 文本框加占位提示（街道并入此处手动填写）。原 `<UInput v-model="state.streetLine1" class="w-full" type="text" />` 改为：

```html
      <UInput
        v-model="state.streetLine1"
        class="w-full"
        type="text"
        :placeholder="t('messages.billing.address1Placeholder')"
      />
```

（`grade=2` 的「地址 2 / streetLine2」、邮编、默认开关、邮箱等其余字段原样保留，不动。）

**删除项**：原独立「国家」字段块（`:label="t('messages.billing.country')"` 那一段整行 `col-span-2`）；原「街道」`USelectMenu` 字段块。`streetSel` ref、`streetSel.current` 赋值、`onStreetChange()` 可保留（内部仍承载街道解算并把结果写进 `state.street`），但不再渲染下拉、也不再绑定 `@update:model-value`。

- [ ] **Step 2: 改 syncState——不再自动覆盖 streetLine1**

`layers/base/app/components/checkout/AddressForm.vue` 的 `syncState()` 当前会执行 `state.streetLine1 = fullAddress()`，街道并入详细地址后这行会覆盖用户手填的门牌号。改为只在空时才回填省市区拼接：

```ts
function syncState() {
  state.province = provinceSel.value.current;
  state.city = citySel.value.current;
  state.district = districtSel.value.current;
  state.street = streetSel.value.current;
  // 街道已并入“详细地址”文本框人工填写，切换省市区时不得覆盖用户已输入的门牌号
  if (!state.streetLine1) state.streetLine1 = fullAddress();
}
```

> 说明：`fullAddress()`（78-82 行）拼「省 市 区 街道」，`state.street` 仍由街道解算写入，故 `if (!state.streetLine1)` 仅在空时给出前缀基线，用户随后追加门牌号；此后切换省市区不再清空用户输入。`onSubmit` 里 `streetLine1: state.streetLine1 || fullAddress()` 作兜底，保持不变。

- [ ] **Step 3: 改 preselectByLocation——逆地理填充后预填详细地址**

`preselectByLocation()` 末尾同步 state 后，若详细地址为空则用逆地理 `formattedAddress` 预填（高德返回的省市区街道完整地址），落进 `streetLine1`：

```ts
  // 省列表可能已在 onMounted 的 else 分支预加载，避免重复请求
  if (provinceSel.value.items.length === 0) {
    await loadDistrict(null, provinceSel.value);
  }

  if (!geo) {
    // 反查失败：用首页定位城市兜底（仅回填市，供用户按需选省/区）
    const fallbackCity = locationStore.cityName;
    if (fallbackCity) state.city = state.city || fallbackCity;
    return;
  }

  const prov = pickBest(provinceSel.value, geo.province);
  if (!prov) return;
  provinceSel.value.current = prov.name;

  await loadDistrict(prov.adcode, citySel.value);
  await cascadeGeo(geo);
  // 街道并入详细地址：逆地理结果(省市区街道)在用户未手填时预填进 streetLine1
  if (!state.streetLine1 && geo.formattedAddress) {
    state.streetLine1 = geo.formattedAddress;
  }
  syncState();
```

- [ ] **Step 4: 补 i18n——详细地址占位文案（双语同步）**

`zh-CN.ts` 的 `messages.billing` 组内新增：

```ts
      address1Placeholder: "详细地址（含街道、门牌号）",
```

`en-US.ts` 的 `messages.billing` 组内新增：

```ts
      address1Placeholder: "Detailed address (street, number)",
```

> 若 `address1`（详细地址标签）文案本身已含“街道”，可省略 placeholder；否则保留新增。不删除任何既有词条。

- [ ] **Step 5: 构建验证**

Run: `cd /d/zhao/nshop; npm run build`
Expected: 退出码 0，无 Vue 模板/类型报错。

- [ ] **Step 6: 手机视口截图验收（硬性）**

本地 dev 服务器（`http://localhost:8080`，16.16.4 与生产 shop-api 代理）已运行；用 Playwright 手机视口 390×844（dpr=2）进入结算页，构造一个「物流需地址」箱以展示地址表单，点「新增地址」，然后断言并截图：

```python
# scripts/_verify_addr_row_one.py
# 说明: 通过 dev 代理 shop-api 以访客加购 KNIFE-SET-3(id=8,档案8需联系) + SPK-BT-01(id=6,物流需地址) 组成混合箱，
# 进入结算页打开“新增地址”表单，验证 国家/省/市/区 四者在同一行(grid-cols-4 基线一致)、无“街道”独立下拉。
import json, os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8080"; SHOP = BASE + "/shop-api"
def add(ctx, vid):
    r = ctx.request.post(SHOP, data=json.dumps({
        "query": "mutation($i:ID!,$q:Int!){ addItemToOrder(productVariantId:$i, quantity:$q){ ... on Order{ id } ... on ErrorResult{ errorCode message } } }",
        "variables": {"i": vid, "q": 1}}), headers={"Content-Type": "application/json"})
    return json.loads(r.text())

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                        locale="zh-CN", is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto(BASE, timeout=60000); pg.wait_for_load_state("networkidle")
    add(ctx, "8"); add(ctx, "6")
    pg.goto(BASE + "/checkout", timeout=80000); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(3000)
    pg.get_by_text("新增地址", exact=False).first.click(); pg.wait_for_timeout(2500)
    labels = pg.locator("form label, form [class*='label']").all_inner_texts()
    # 断言: 国家/省份/城市/区县 标签均出现
    joined = " ".join(labels)
    assert "国家" in joined and "省份" in joined and "城市" in joined and "区县" in joined, joined
    # 断言四者在同一行: 取省份/城市/区县下拉的 bounding_box top 相等（国家因标签行高略异，容差 2px）
    boxes = {}
    for name in ("省份", "城市", "区县"):
        b = pg.get_by_label(name).bounding_box()
        boxes[name] = b["y"]
    pg.screenshot(path=os.path.join(r"d:\zhao\nshop\scripts\shots", "checkout05-addr-one-row.png"), full_page=True)
    print("row tops:", {k: round(v,1) for k,v in boxes.items()}, "| SAVED checkout05-addr-one-row.png")
    b.close()
```

Run: `python scripts/_verify_addr_row_one.py`
Expected: 打印三列 top 值近似相等（差值 ≤ 2px），生成 `scripts/shots/checkout05-addr-one-row.png`，断言通过不抛异常。
（若 dev 服务器未运行：先 `npm run dev` 启服，或改 `BASE` 指向线上前端。）

- [ ] **Step 7: Commit**

```bash
git add layers/base/app/components/checkout/AddressForm.vue layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts scripts/_verify_addr_row_one.py scripts/shots/checkout05-addr-one-row.png
git commit -m "feat(checkout-address): 国家/省/市/区一行，街道并入详细地址"
```

---

## Self-Review

**Spec 覆盖**：需求「国家、省、市、区显示在一行」→ Task1 Step1 改为 `grid-cols-4` 单行；「手机也强制一行」→ 网格为固定 `grid-cols-4` 无 md/lg 折行；「街道并入详细地址」→ 删除街道下拉，Step3/4 让逆地理结果与占位提示落在 `streetLine1`；保留高德四级联动与逆地理自动填充。全部覆盖。

**占位符扫描**：无 TBD/TODO；每步含完整代码与命令。

**类型/命名一致性**：国家下拉沿用既有 `countries` 变量；`provinceSel/citySel/districtSel/streetSel` 均沿用既有命名；`geo.formattedAddress` 为 `ReverseGeocodeInfo` 既有字段；`messages.billing.address1Placeholder` 双语同步新增，与既有 `messages.billing.*` 命名一致。`fullAddress()`、`syncState()`、`preselectByLocation()` 签名未变。