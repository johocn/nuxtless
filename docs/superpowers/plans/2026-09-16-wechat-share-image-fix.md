# 微信分享图片修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 nshop 商品详情页微信转发卡片图片不显示——og:image 加兜底链（无图商品不再空白）+ 体积压缩到 ≤300KB + 版本号升 v4 破微信缓存。

**Architecture:** 唯一改动文件 `layers/base/app/pages/product/[slug].vue`。og 主图来源从「商品图 → 空」改为「商品图 → 渠道 shareImageUrl → /share-default.jpg」三段兜底；`defineOgImage` 输出尺寸 1200×600→800×400、入图参数 w=800&q=70→w=400&q=60 压体积；`OG_SHARE_VERSION` v3→v4。渠道 shareImageUrl 复用 `GetChannelTheme` 查询（`useAsyncData` 同 key `channel-share-image`，与 WechatShare 组件 SSR 去重不新增请求）；`defineOgImage` 的 `image` 参数从 `.value` 快照改为传 computed，确保 SSR 渲染时读到异步兜底值。satori 模板不改。

**Tech Stack:** Nuxt 3 SSR / nuxt-og-image / useAsyncData / useAsyncGql / satori（ProductCard.satori.vue）

**Spec:** `docs/superpowers/specs/2026-09-16-wechat-share-image-fix-design.md`

---

### Task 1: [slug].vue 增加渠道 shareImageUrl 获取（SSR 去重）

**Files:**
- Modify: `layers/base/app/pages/product/[slug].vue`（script setup 内 ogImageSrc 附近）

- [ ] **Step 1: 在 ogImageSrc computed 之前插入渠道分享图获取**

在 `layers/base/app/pages/product/[slug].vue` 中，`// og 分享主图` 注释块之前（约第 63 行）插入：

```ts
// 渠道级分享主图兜底：Channel.customFields.shareImageUrl（复用 GetChannelTheme，
// 与 WechatShare 组件同 useAsyncData key → SSR 去重不新增请求）
const { data: channelShareImage } = useAsyncData(
  "channel-share-image",
  async () => {
    const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
    return (res.data.value as any)?.activeChannel?.customFields?.shareImageUrl ?? "";
  },
  { server: true },
);
```

- [ ] **Step 2: 校验语法**

Run: `npx nuxi typecheck`（若项目配置了 typecheck；否则 `npm run build` 在 Task 4 兜底）
Expected: 无该文件新增的类型错误（shareImageUrl 可能为 string，使用 `?? ""` 已兜底）。

---

### Task 2: ogImageSrc 改造为三段兜底链 + 响应式传递

**Files:**
- Modify: `layers/base/app/pages/product/[slug].vue:65-80`（ogImageSrc computed）、`:108-121`（defineOgImage）

- [ ] **Step 1: 重写 ogImageSrc computed（兜底链 + 压缩参数 w=400 q=60）**

将现有 `ogImageSrc` computed（约 65-80 行）整体替换为：

```ts
// og 分享主图兜底链：商品图 → 渠道 shareImageUrl → 内建默认图（与 WechatShare 的
// JS-SDK imgUrl 兜底链一致，保证无图商品分享卡左侧也有图）。
// 转 JPEG 并缩放到 ≤400px 宽，压体积（微信分享缩略图 ~300KB 软上限）。
const ogImageSrc = computed(() => {
  const raw =
    product.value?.featuredAsset?.preview ??
    product.value?.assets?.[0]?.preview ??
    channelShareImage.value ??
    "";
  if (!raw) return `${i18NBaseUrl}/share-default.jpg`;
  try {
    const u = new URL(raw, i18NBaseUrl);
    u.searchParams.set("format", "jpg");
    u.searchParams.set("w", "400");
    u.searchParams.set("q", "60");
    return u.toString();
  } catch {
    return raw;
  }
});
```

- [ ] **Step 2: defineOgImage 传响应式 image + 输出尺寸 800×400**

将 `defineOgImage` 调用（约 108-121 行）中 `image: ogImageSrc.value` 改为 `image: ogImageSrc`，并增加 `width/height`（第 3 参 options 与 fonts 合并）：

```ts
defineOgImage(
  "ProductCard.satori",
  {
    colorMode: ogColorMode,
    productName: product.value?.name,
    price: formatPrice(ogPriceCents.value),
    image: ogImageSrc, // 传 computed：SSR 渲染时读到异步兜底后的最终值
    brand: siteName.value,
    version: OG_SHARE_VERSION,
  },
  {
    width: 800,
    height: 400,
    fonts: [OG_CJK_FONT],
  }
);
```

- [ ] **Step 3: 递增版本常量 v3 → v4**

将 `const OG_SHARE_VERSION = "v3";`（约 83 行）改为：

```ts
const OG_SHARE_VERSION = "v4";
```

（注释可保留：内容改版递增，强制微信对新 og:image URL 重新抓取。）

---

### Task 3: 本地构建 + og 卡渲染验证

**Files:**
- 无新增文件；验证产物在 `.output` 下

- [ ] **Step 1: 本地构建**

Run: `npm run build`（cwd `d:\zhao\nshop`）
Expected: 构建成功，无报错。

- [ ] **Step 2: 本地起服务并抓取无图商品 og 卡**

Run:
```powershell
npm run preview   # 另开终端，或后台运行
```
然后抓取无图商品页 og:image 并下载：

```powershell
$r = Invoke-WebRequest -Uri "http://localhost:3000/product/hotel-suite-test" -UseBasicParsing
$m = [regex]::Match($r.Content, 'property="og:image" content="([^"]+)"')
$url = $m.Groups[1].Value
Write-Output "ogimg=$url"          # 期望 URL 含 image_~base64(share-default.jpg 或渠道图) 或 fonts_...&image_...
Invoke-WebRequest -Uri $url -OutFile "d:\zhao\tmp_og_nofig.png" -UseBasicParsing
```
Expected: URL 中 `image_` 参数存在（非空）、下载成功。

用 Read 工具查看 `d:\zhao\tmp_og_nofig.png`：**左侧应有兜底图**（share-default 或渠道图），非空白。

- [ ] **Step 3: 抓取有图商品 og 卡并验证体积**

```powershell
$slug = [uri]::EscapeDataString("温泉门票")
$r = Invoke-WebRequest -Uri "http://localhost:3000/product/$slug" -UseBasicParsing
$m = [regex]::Match($r.Content, 'property="og:image" content="([^"]+)"')
Invoke-WebRequest -Uri $m.Groups[1].Value -OutFile "d:\zhao\tmp_og_withimg.png" -UseBasicParsing
(Get-Item "d:\zhao\tmp_og_withimg.png").Length
```
Expected: 体积 **≤ 307200 字节（300KB）**。

- [ ] **Step 4: 提交（若 Task 1-3 全部通过）**

```bash
git add layers/base/app/pages/product/[slug].vue
git commit -m "fix(share): og 分享图三段兜底链+压体积(800x400,入图400w)+版本v4破缓存"
```

---

### Task 4: 线上部署 + 验证

**Files:**
- 部署 nshop 构建产物到 www.youshop.cn（沿用既有部署机制：本地构建 → scp 产物 → 服务器解压/拷入 → pm2 restart）

- [ ] **Step 1: 推送代码**

```bash
git push
```

- [ ] **Step 2: 按既有部署机制部署 www.youshop.cn**

（nshop 部署走 `scripts/deploy.mjs` 或既有流程；若需服务器 git pull + 本地构建产物上传，按项目部署铁律：本地构建、服务器只解压/restart。）

- [ ] **Step 3: 线上验证无图商品 og 卡**

```powershell
$r = Invoke-WebRequest -Uri "https://www.youshop.cn/product/hotel-suite-test" -UseBasicParsing
$m = [regex]::Match($r.Content, 'property="og:image" content="([^"]+)"')
Write-Output $m.Groups[1].Value   # 期望 URL 含 image_ 参数（有兜底图）且 version 段为 v4
Invoke-WebRequest -Uri $m.Groups[1].Value -OutFile "d:\zhao\tmp_og_online_nofig.png" -UseBasicParsing
```
Read 查看：左侧有图，非空白。

- [ ] **Step 4: 线上验证有图商品 og 卡体积**

```powershell
$slug = [uri]::EscapeDataString("温泉门票")
$r = Invoke-WebRequest -Uri "https://www.youshop.cn/product/$slug" -UseBasicParsing
$m = [regex]::Match($r.Content, 'property="og:image" content="([^"]+)"')
Invoke-WebRequest -Uri $m.Groups[1].Value -OutFile "d:\zhao\tmp_og_online_withimg.png" -UseBasicParsing
(Get-Item "d:\zhao\tmp_og_online_withimg.png").Length
```
Expected: ≤300KB，且渲染正常（Read 目检商品图/文字无异常）。

- [ ] **Step 5: 微信实转截图（补充操作手册）**

手机微信打开 www.youshop.cn 商品详情页（无图商品 hotel-suite-test + 有图商品温泉门票）→ 转发好友/朋友圈 → 截图确认图片显示。标准视口 390×844，截图补充到操作手册。

---

## Self-Review

**1. Spec coverage:**
- 兜底链（spec 3.1）→ Task 1 + Task 2 Step 1 ✅
- 体积压缩 800×400 + w=400&q=60（spec 3.2）→ Task 2 Step 1-2 ✅
- satori 模板不改（spec 3.3）→ 计划无该文件改动 ✅
- 版本 v4（spec 3.4）→ Task 2 Step 3 ✅
- 本地构建验证（spec 5.1）→ Task 3 ✅
- 线上部署验证（spec 5.2）→ Task 4 ✅
- 不做事项（spec 6）→ 计划未包含签名修复/zhao-third 缓存 ✅

**2. Placeholder scan:** 无 TBD/TODO；每步含实际代码与命令 ✅

**3. Type consistency:** `channelShareImage`（useAsyncData 返回 ref）在 computed 内用 `.value` 访问；`ogImageSrc` computed 传给 defineOgImage 为响应式引用；`OG_SHARE_VERSION`/`OG_CJK_FONT` 命名与现有一致 ✅
