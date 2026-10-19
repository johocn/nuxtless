# 代买单 · 权益边界条（限额与优惠前置公示）2026-10-19

## 背景
审计发现 t3 代买单店首页未在提交委托前公示**起付金额 / 单笔限额 / 单日限额 / 会员折扣 / 满减**等权益与边界数值（仅报价卡在输入后才展示）。本次在店招与委托表单之间新增「权益边界条」：横滑胶囊 pills，前置公示。

## 实现要点
- 组件：`layers/base/app/components/bill-pay/BillPayLimitsStrip.vue`（插入 `BillPayHome.vue` 店招与表单之间）
- **数值全部取 `billPayConfig` 动态渲染，禁止硬编码**：
  - 会员折扣 / 满减：优先后端双语 `label`（LocalizedText），缺失时回退 i18n 模板（`limitMember` / `limitThreshold`）
  - 起付 / 单笔 / 单日限额：`minAmount` / `maxAmount` / `dailyLimitAmount`（分 → 元 `billpayYuan`）+ i18n 模板（`limitMin` / `limitMax` / `limitDaily`）
  - 单日限额与单笔限额相同时自动去重不重复公示
- **SSR 前置公示**：`BillPayHome` 改用 `useAsyncData` 服务端预取配置，数字直接进首屏 HTML（失败降级 null，条隐藏，报价卡占位逻辑不变）
- i18n：zh-CN / en-US 两包新增 5 词条（其余语言经 `zhFallbackLocale` 深合并回退中文，与 billpay 模块既有惯例一致）

## 顺带修复
- `billpayLabel()` 短码/全码匹配 bug：i18n locale 用短码（`en`）而后端 label 键为全码（`en-US`），旧逻辑 `rec["en"]` 落空取首值导致 en 页显示中文 label；现按主码归一匹配（`en` 命中 `en-US` 键）。报价卡优惠明细 label 同步受益。

## 验证（t3 生产实值：min ¥20 / 单笔≤¥2000 / 会员95折 / 满100减5，daily==max 去重）
- SSR HTML 命中 4 胶囊全部数值（zh + en 双语）
- Playwright 手机视口 390×844 dpr=2 截图：
  - `t3-billpay-limits-strip.png` 首屏（zh）
  - `t3-billpay-limits-full.png` 整页（zh）
  - `t3-billpay-limits-en.png` 首屏（en，末位胶囊溢出右缘即横滑设计）
