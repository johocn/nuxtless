# nshop 前端中英文多语言本地化设计

- 日期：2026-08-28
- 项目：nshop
- 目标：全面实现中英文页面展示，消除页面英文残留
- 关联：详见 `docs/superpowers/specs/` 目录下的 nshop 相关设计文档

## 一、背景与现状

nshop 已部署一套完整的多语言基础设施：

- 模块：`@nuxtjs/i18n`，配置于 `layers/base/nuxt.config.ts`
- 语言包：`layers/base/i18n/locales/`，共 10 种（zh-CN / en-US / bg / ru / fa / de / es / fr / it / pt）
- 语言枚举：`layers/base/i18n/locales.ts`（`appLocales`，支持 `APP_LOCALES` 环境变量裁剪）
- 切换器：`app/components/LangSwitcher.vue` + `app/composables/useLangSwitcher.ts`
- 默认/回退策略：`defaultLocale: "zh-CN"`，`fallbackLocale: "zh-CN"`

### 英文显示根因

1. **`zh-CN.ts` 词库自身中英文混杂**（主因）：
   - 已中文化区块：`detail` / `checkout` / `order` / `afterSales` / `account.addresses` 等。
   - 仍为英文占位的区块：`site` / `pages` / `general`（含 `shopFeatures`、`footer`）/ `account`（表单与文案部分）/ `billing` / `error` / `shop` 部分词条。
   - 由于 `fallbackLocale="zh-CN"`，这些英文词条在中文界面下原样输出为英文。
2. **组件模板硬编码英文**（较少）：仅少量残留，如 `SearchModal.vue` 的 "Loading"、`MobileMenu.vue` 的 "Footer"。

## 二、设计决策（已与用户确认）

- **语言范围**：中英为主，保留全部现有 10 个语言包。重点补齐 zh-CN 为完整中文、核对 en-US 为准确英文；其余 8 种不逐字补齐，缺失词条依赖 fallback（zh-CN）兜底。
- **改造深度**：词库 + 硬编码全覆盖。既要补齐 zh-CN 词库英文词条，也要把组件模板中残留硬编码英文抽到 i18n。
- **硬编码策略**：能走 i18n 的文本全部抽词条；品牌词（如 nshop 商标）保留不动。

## 三、架构（沿用现有，不新建）

不引入新依赖、不重建 i18n 体系、不改 fallback 策略。改动聚焦于「词库内容」与「少量组件模板」。

### 兜底链（沿用既有约定，已内置）

`当前 locale → defaultLocale(zh-CN) → 首个值 → 内建占位`

本项目 `fallbackLocale: "zh-CN"` 已天然满足，无需改动 `nuxt.config.ts`。

## 四、具体改动

### 4.1 词库补齐（核心）

**`layers/base/i18n/locales/zh-CN.ts`**

将以下区块中仍为英文的词条译为准确中文（示例，非穷尽）：

| 区块 | 词条示例 | 现状 | 改为 |
|------|----------|------|------|
| `general` | `colorMode` | "Color Mode" | "外观模式" |
| `general` | `system` | "System" | "跟随系统" |
| `general` | `light` | "Light" | "浅色" |
| `general` | `dark` | "Dark" | "深色" |
| `general` | `status` | "Status" | "状态" |
| `general` | `amount` | "Amount" | "金额" |
| `general` | `tax` | "Tax" | "税费" |
| `pages.account` | `signIn` | "Sign in to Your Account" | "登录您的账户" |
| `account` | `password` | "Password" | "密码" |
| `account` | `login` | "Log In" | "登录" |
| `account` | `register` | "Register" | "注册" |
| `error` | `general` | "Something went wrong" | "出错了" |
| `site` | `title` | "Nuxtless" | 保留品牌名（不回译） |
| `billing` | 各表单项 | "First Name" 等 | "姓氏 / 街道 / 城市 / 邮编 / 国家 / 手机号 / 邮箱" 等 |

**「保留品牌」约束**：`site.title` / `site.current "Nuxtless"` 等品牌名与面向国际的 tagline 保持原样，不做强制中文化；仅确保不影响中文用户理解的 UI 操作类文案翻译。

**`layers/base/i18n/locales/en-US.ts`**

逐键核对，确保英文准确、与 `zh-CN.ts` 键位完全一致（不新增不删除结构）。

**其它 8 种语言包（bg/ru/fa/de/es/fr/it/pt）**

保留现有内容，不逐字补齐；键位结构保持与 zh-CN 一致即可，缺词条靠 fallback 回退中文。

### 4.2 硬编码抽取

扫描 `layers/base/app/components/**/*.vue` 与 `layers/base/app/pages/**/*.vue` 渲染文本中的硬编码英文，抽为 i18n 词条：

- `SearchModal.vue`："Loading" → `general.loading`
- `MobileMenu.vue`："Footer" → 新增词条（结合上下文，可能是占位容器）

抽词条时在 `zh-CN.ts` 与 `en-US.ts` 同步新增中英词条。

### 4.3 不动项

- `nuxt.config.ts`（i18n 配置保持不变）
- `LangSwitcher.vue` / `useLangSwitcher.ts` / `locales.ts`（切换与枚举逻辑不动）
- SEO / 路由多语言前缀 `/sitemap` / `schema-org` 逻辑
- 品牌名与营销性英文 tagline

## 五、测试与验收

### 本地验证

1. `pnpm dev` 启动本地预览（连线上后端走 devProxy）。
2. 依次切换 zh-CN / en-US / 任一第三方语言（如 de-DE）：
   - **中文**：核心页面（首页 / 详情 / 购物车 / 结账 / 订单 / 售后 / 账户）文案均为中文。
   - **英文**：英文准确、键位完整无回退异常。
   - **第三方（de-DE）**：缺失词条正确回退中文，不报错。
3. 无 Vue/i18n 编译错误（占位符 `{{n}}` 等不与词条语法冲突）。

### 键位一致性校验

- 对比 `zh-CN.ts` 与 `en-US.ts` 顶层键集合一致，避免缺失回退导致某键在英文下不显示。
- 主要组件使用 `<script>` 中 `const { t } = useI18n()` 或模板 `$t` / `{{ $t('...') }}`，抽词条后对应引用同步更新。

## 六、不做的（YAGNI）

- 不新增语言 / 不重建 i18n / 不改 fallback 策略。
- 不强制翻译品牌名与国际化 tagline。
- 不逐字补齐 8 种第三方语言（保留 fallback 语义）。
- 不触碰后端返回数据本身的多语言（如商品名/描述由后端 i18n 管理，不在本范围）。

## 七、部署

遵循项目部署铁律：本地构建 → 提交 dist 产物到 git → 服务器 `git pull` + `pm2 restart nshop`；**绝不在服务器构建**。