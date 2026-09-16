# 微信分享图片修复设计（og:image 兜底链 + 体积压缩）

- 日期：2026-09-16
- 状态：已确认（方案 A）
- 范围：nshop（www.youshop.cn）商品详情页微信转发卡片图片

## 1. 背景与问题

用户反馈：微信转发好友/朋友圈时，商品详情页的分享**图片不显示**（空白/无图），但标题与描述正常。9月13日 15:01 之前的仓库文档记录微信转发好友图片正确，之后失效。

## 2. 根因（已线上实测确认）

微信内转发卡片图片有两条来源，任一失效即"无图"：

| 路径 | 机制 | 实测结论 |
|---|---|---|
| A. JS-SDK 动态分享 | 签名生效 → `wx.updateAppMessageShareData` 设置 imgUrl | 签名接口正常（h.joho.cn 200），但前端 `fetchJssdkSignature` 依赖 `sessionStorage.youshop_sso_base_url`（仅登录流程写入）→ **未登录用户签名不绑定** |
| B. og:image 静态抓取 | 微信服务器抓 `og:image` 标签 | og 标签输出正确，但图片链路有 2 个缺陷 |

**og:image 链路缺陷（本次修复目标）：**

1. **无图商品空白**：`featuredAsset=null, assets=[]` 时 `ogImageSrc` 返回 `""`，satori 模板 `v-if="image"` 不渲染 → 分享卡左侧空白，**无兜底**（实测 `hotel-suite-test`）。
2. **有图商品体积超限**：og 卡输出 1200×600 PNG 实测 **710KB**，远超微信缩略图 ~300KB 软上限，可能被抓取拒绝/压缩失败（实测 `温泉门票`）。

标题/描述正常是因为 `og:title`/`og:description` 输出正确——即使签名失效，og 抓取路径同样能提供正确标题/描述，因此**问题确实定位在图片链路而非签名**。

## 3. 修复设计（方案 A）

保留 satori 卡片样式（品牌/价格/描述视觉），修复 og:image 链路的两个缺陷。改动集中在 `layers/base/app/pages/product/[slug].vue`。

### 3.1 og:image 兜底链

`ogImageSrc` 从「商品图 → 空」改为与 WechatShare 组件 JS-SDK imgUrl 一致的兜底链：

```
商品图 (featuredAsset.preview ?? assets[0].preview)
  → 渠道 shareImageUrl (GetChannelTheme.customFields.shareImageUrl，SSR 已可查)
  → /share-default.jpg（内建默认分享图，107KB，存在）
```

任一环节有值即停；全空则用最后兜底。保证 `image` prop 恒有值 → satori 卡左侧恒有图。

实现要点：
- 复用 `GetChannelTheme` 查询（`layers/base/gql/queries/context.gql` 已有 `shareImageUrl` 字段，WechatShare 组件已用同一查询，SSR 去重不新增请求）。
- 渠道 shareImageUrl 若是相对路径，用 `i18NBaseUrl` 补全为绝对 URL（与商品图一致的处理）。

### 3.2 体积压缩（≤300KB）

服务器无 sharp（部署铁律：不安装、win32 产物不携带 native 二进制），og 卡只能输出 PNG，靠两处降体积：

| 项 | 现值 | 改后 | 说明 |
|---|---|---|---|
| og 卡输出尺寸 | 1200×600（默认） | **800×400** | `defineOgImage` 传 `width/height`；面积降 56%，仍满足微信 ≥300×300 建议 |
| 入图压缩参数 | `format=jpg&w=800&q=70` | **`format=jpg&w=400&q=60`** | 商品图在卡内约占半宽，缩略图场景 400w 足够 |

预期：有图商品 og 卡 710KB → ~200-280KB（≤300KB 目标）。

### 3.3 satori 模板

`ProductCard.satori.vue` **不改**：`v-if="image"` 在兜底链生效后恒有值，自动消除空白分支。

### 3.4 版本常量

`OG_SHARE_VERSION` 由 `v3` 递增为 **`v4`**：og:image URL 变化强制微信重新抓取，绕开旧卡缓存（含此前 710KB 旧卡）。

## 4. 变更文件清单

- `layers/base/app/pages/product/[slug].vue`：ogImageSrc 兜底链 + 压缩参数 + 输出尺寸 + 版本常量（唯一改动文件）
- （验证用）无图商品 `hotel-suite-test`、有图商品 `温泉门票` 作为回归对象

## 5. 验证计划

### 5.1 本地构建验证
1. `npm run build`（nshop）本地构建成功。
2. 本地起服务抓无图商品 og 卡：左侧有兜底图（share-default.jpg 或渠道图），非空白。
3. 抓有图商品 og 卡：体积 ≤300KB。

### 5.2 线上部署验证
1. 构建产物部署 www.youshop.cn。
2. 抓取 `https://www.youshop.cn/product/hotel-suite-test` og:image → 下载验证：非空白、有图。
3. 抓取温泉门票 og:image → 下载验证：体积 ≤300KB、渲染正常。
4. 微信实转：手机微信打开商品页 → 转发好友/朋友圈 → 截图确认图片显示（补充到操作手册，标准视口 390×844）。

## 6. 不做事项（本次范围外，记录后续）

- **签名触发修复**：未登录用户 JS-SDK 分享不绑定（`sessionStorage.youshop_sso_base_url` 依赖）是真实问题，但用户判断根因在图片链路；本设计先修 og:image，签名加固留作后续独立任务。
- **zhao-third 无 token/ticket 缓存**（strapi-course 链路）：strapi 侧问题，不在 nshop 本次范围。
- 分享卡视觉/版式调整：保持现状。
