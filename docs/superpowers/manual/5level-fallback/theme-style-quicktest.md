# nshop 主题风格 · 最简手测卡（3 条用例）

> 环境：线上 C 端 `https://www.youshop.cn` + 后台 `https://e.joho.cn/guanli/`
> 视口：手机 390×844（dpr=2=780×1688），截图留档按项目铁律存 `shots/`
> 基线快照：**2026-09-21**（若线上已被他人改过，先跑 §1 校准再对期望值）
>
> ⚠️ 本卡取代旧手册中的 L2 步骤：`5level-fallback-manual-test.md` 第 91 行「店铺信息页选模板」**已失效**——模板分区已从店铺信息页移除，唯一风格入口是「主题风格」页。

---

## 0. 后台三个入口

| 页面 | 用途 | 路径（hash 路由） | 权限 |
|---|---|---|---|
| 主题风格 | 选模板（L2）+ 令牌覆盖（L3） | `#/pages/decorate/theme/index` | tier 3 |
| 风格模板库 | 建/改模板 palette | `#/pages/platform/templates/index` | ShopTemplatesRead / 超管 |
| 全局配置 | L1 主题令牌 + 页面 defaults | `#/pages/platform/global-config/index` | ShopTemplatesUpdate / 超管 |

三层写入位置：

- L2 → `channel.customFields.templateId`
- L3 → `channel.customFields.themeTokensOverride`（JSON 文本）
- L1 → `shop_global_config.themeTokens`（**app 级**，与渠道无关）

---

## 1. 一条命令的判定法（30 秒）

nshop 是 Nuxt SSR，主题令牌在首帧 HTML 的 `<style>` 里就注入了（`app.vue` 的 `html:root:root{...}`），**不开浏览器就能判定层级是否生效**。

```powershell
$r = Invoke-WebRequest -Uri 'https://www.youshop.cn/?cb=1' -UseBasicParsing
[regex]::Matches($r.Content,'--(ui-primary|theme-accent|ui-radius):[^;"}]+') |
  ForEach-Object { $_.Value } | Select-Object -Unique
$r.Headers['X-Template-Version']
```

> 输出里会混入两行 Nuxt UI 自带的 `--ui-primary: var(--ui-color-primary-*)`，忽略；取**带 `#`** 的那条。
> 改配置后若结果没变，把 `?cb=1` 换个值（`?cb=2`）再跑，破 SSR/nginx 缓存滞后。

### 基线期望（2026-09-21 实测）

| CSS 变量 | 期望值 | 来源层级 |
|---|---|---|
| `--ui-primary` | `#ff5000` | **L2** 模板 palette `taobao-orange` |
| `--theme-accent` | `#fff7e6` | **L2** 模板 `tokens.accentColor`（覆盖预设的 `#fff0e6`） |
| `--ui-radius` | `8px` | L1 / L2 同为 8，不可单独判别 |

### 基线现状（只读查询实测）

| 层 | 载体 | 值 |
|---|---|---|
| C 端根渠道 | `activeChannel` | id=1 `__default_channel__`（token `cnx87ezvmjx8nn3bth6c`） |
| L1 | `shopGlobalConfig(app:nshop).themeTokens` | `#ff6600` / `#fff3e6` / radius 8 |
| L2 | `channel.templateId` = **1**「橙色经典」 | palette `taobao-orange` + `tokens.accentColor:#fff7e6` |
| L3 | `channel.themeTokensOverride` | `null` |
| 遗留 | `channel.themeId` | `jd-red`（会触发后台迁移提示条） |

---

## 2. 前置 P0

1. 打开 `https://e.joho.cn/guanli/` 登录（需超管或店长权限）。
2. 进「店铺装饰 → 主题风格」。
3. 顶部**目标端分段器选 `nshop`**（默认就是 nshop；若选成 vshop 模板列表会是另一套）。
4. **自检当前渠道**（关键）：摘要卡应显示模板名 **「橙色经典」**、生效主色 `#ff5000`、来源徽标 **L2**。
   - 若显示的是别的模板或「未引用模板」→ 后台当前登录店铺不是默认渠道，改动**不会**体现在 `www.youshop.cn` 根路径 → 先去「系统 → 切换店铺」切到默认渠道那家店，再回来。
   - 后台写的是 `activeChannel`（当前登录店铺渠道），C 端根路径读的是 `__default_channel__`，两者必须一致。
5. 页面底部会出现**黄色旧版主题提示条（`jd-red`）**——先不要点，留给可选 C4。

---

## 3. 三条用例

### C1 · L2 模板引用（只读，不改任何数据）

| 步骤 | 操作 | 期望结果 |
|---|---|---|
| 1 | 跑 §1 判定法 | `--ui-primary:#ff5000` |
| 2 | 与 L1 值对比 | L1 是 `#ff6600` ≠ `#ff5000` ⟹ **证明 L2 压过 L1**（D1 设计语义，不是 bug） |
| 3 | 主题风格页底部点「刷新预览」 | `primaryColor` 行右侧徽标 = **L2** |

**可选主动版**：模板卡片切到「京东红」或「晨曦金」→ 保存 → 换 `?cb=` 跑判定法 → 主色应变 `#e1251b` / `#d4a574`。测完切回「橙色经典」保存。

**还原**：无。

---

### C2 · L3 令牌覆盖（单店临时换肤）

| 步骤 | 操作 | 期望结果 |
|---|---|---|
| 1 | 「令牌覆盖」填 primaryColor `#7b2ff7`、accentColor `#ede4ff`、radius `12` | 无红色报错 |
| 2 | 点「保存」 | toast 保存成功 |
| 3 | 换 `?cb=` 跑判定法 | `--ui-primary:#7b2ff7`、`--theme-accent:#ede4ff`、`--ui-radius:12px` |
| 4 | 主题风格页点「刷新预览」 | 三个字段徽标均为 **L3**（L3 last-wins） |
| 5 | 手机视口 390×844 dpr=2 截图 C 端首页 → `shots/` | 主题变紫 |

**还原**：清空三个输入框 → 保存 → 判定法回到 `--ui-primary:#ff5000`。

---

### C3 · L1 全局配置 + 回退验证

| 步骤 | 操作 | 期望结果 |
|---|---|---|
| 1 | 主题风格页模板卡片选「**不使用模板**」→ 保存 | 摘要卡来源徽标变 **L1**（主色 `#ff6600`） |
| 2 | 换 `?cb=` 跑判定法 | `--ui-primary:#ff6600` ⟹ **未引用模板时看 L1** |
| 3 | 「平台管理 → 全局配置」，目标端选 nshop，主色改 `#4caf50` → 保存 | 保存成功 |
| 4 | 换 `?cb=` 跑判定法 | `--ui-primary:#4caf50` ⟹ **L1 改动直接生效** |
| 5 | 手机视口截图 C 端首页 | 主题变绿 |

**还原（两步都要做）**：
1. 全局配置主色改回 `#ff6600` → 保存。
2. 主题风格页模板选回「橙色经典」→ 保存。
3. 跑判定法确认回到 `--ui-primary:#ff5000`。

---

### 可选 C4 · 旧 `themeId` 一键迁移

| 步骤 | 操作 | 期望结果 |
|---|---|---|
| 1 | 黄色提示条点「一键迁移」 | 弹窗列出映射 `primaryColor: #E1251B`、`radius: 6` |
| 2 | 确认 | toast 成功；提示条消失；令牌覆盖格自动填入这三个值 |
| 3 | 换 `?cb=` 跑判定法 | `--ui-primary:#e1251b`、`--ui-radius:6px` |
| 4 | 只读校验渠道字段 | `activeChannel.customFields` 中 `themeId` 已为 `null`、`themeTokensOverride` 有值 |

**还原**：清空令牌覆盖三格 → 保存（回到 L2 `#ff5000`）。`themeId` 已被清空属预期，不必恢复。

---

## 4. 收尾检查

- [ ] 三条判定法结果与期望一致
- [ ] `--ui-primary` 最终 = `#ff5000`（回到 L2 基线）
- [ ] 后台主题风格页摘要卡 = 「橙色经典」+ 徽标 L2
- [ ] 全局配置（nshop）主色 = `#ff6600`；令牌覆盖三格为空
- [ ] C2/C3 的手机视口截图已存 `shots/`

---

## 5. 现象速查

| 现象 | 根因 | 处理 |
|---|---|---|
| 改了配置 C 端不变 | SSR / nginx 缓存滞后 | 换 `?cb=` 冷加载 |
| 引用模板时改 L1 主色不生效 | 令牌链 L1 < L2（设计语义 D1） | 改模板 palette，或「不使用模板」 |
| 后台预览显 L2、C 端却是 L1 | 后台 `mergedPreview` 不校验模板 app/enabled（D8） | 以 C 端实机判定法为准 |
| 判定法取到 `var(--ui-color-primary-500)` | Nuxt UI 自带同名变量 | 取带 `#` 的那条 |
| 目标端选 vshop 后模板列表空了 | 模板库按 app 隔离 | 切回 nshop |

---

## 附：只读探针命令（不改数据，用于校准基线）

```powershell
# 渠道主题字段（默认渠道）
$b = '{"query":"{ activeChannel { id code customFields { templateId themeTokensOverride themeId } } }"}'
Invoke-RestMethod -Uri 'https://www.youshop.cn/shop-api' -Method Post -ContentType 'application/json' -Body $b |
  ConvertTo-Json -Depth 8

# L1 全局配置 + L2 模板展开
$b = '{"query":"{ shopTemplate(app: \"nshop\") { id name app enabled version theme } shopGlobalConfig(app: \"nshop\") { themeTokens } }"}'
Invoke-RestMethod -Uri 'https://www.youshop.cn/shop-api' -Method Post -ContentType 'application/json' -Body $b |
  ConvertTo-Json -Depth 10
```

> GraphQL 字符串参数需写成 `\"nshop\"`；PowerShell 用**单引号**包住整个 body，避免被提前解析。