# 京东风格首页移动端打磨（logo / 主题色 / 页脚露出）设计

> 日期：2026-08-26
> 范围：仅本次可执行的三个明确改动。**布局级模板切换**作为独立子项目另行规划，不纳入本文。

## 背景

线上 www.youshop.cn 已上线京东风格首页（PC 全屏 + 移动端单列 + 移动端底部 TabBar/功能宫格/品牌闪购）。存在四个待处理问题，其中三个本次落地：

1. 手机版顶栏用的品牌绿 logo-top（#34b66a/#066d3c），与京东红不统一。
2. PC 京东头（JdPcHeader 红字 youShop）不显示 logo-top，手机（AppHeader 绿 logo）显示 —— 双轨配色。
3. 结算/配送等官方 UI 组件走 `--ui-primary`，当前渠道 `data-theme` 未设 `jd-red`，回退为 `default`（深青绿），导致配送/按钮为绿色、与京东红首页不一致。
4. 移动端京东首页底部 fixed TabBar 遮挡了 AppFooter（logo-full + 分类导航），页脚内容看不到。

## 根因

- [logo-top.svg](../public/logo-top.svg)：原生品牌绿为 `#34b66a` / `#066d3c`。
- [theme.css](../app/assets/css/theme.css)：`--ui-primary` 由 `<html data-theme>` 决定；`useChannelTheme` 读取后端 `activeChannel.customFields.themeId`。未设置则回退 `default` -> `#134e4a`（深青绿）。
- [default.vue](../app/layouts/default.vue)：AppFooter 位于布局最外层，移动端被 fixed TabBar 覆盖。

## 方案

### A. logo-top.svg 改为红色 youShop 文字版

- 替换 `public/logo-top.svg` 内容为加粗「youShop」文字，`fill: #E6162D`，与 PC 京东头一致。
- `AppHeader` 经 `logoTop` (`/logo-top.svg`) 渲染，手机顶栏即显示红色 youShop。
- `logo-full.svg` 本次保持不动。

### B. default 渠道主题切为京东红（全局）

- 通过 Vendure admin API 更新 **default channel** 的 `customFields.themeId = "jd-red"`。
- 生效后全站 `--ui-primary -> #E1251B`，结算/配送/按钮/表单统一京东红。
- 纯数据改动，前端无需改代码。

### C. 移动端页脚露出

- 京东移动版 fixed TabBar 遮挡 AppFooter。给 `AppFooter` 移动端底部增加留白：`pb-[calc(52px+env(safe-area-inset-bottom))] lg:pb-0`，使页脚（logo-full + 分类导航）完整可见，PC 不受影响。

## 排除项

- 布局级模板切换（后台为不同渠道选择京东/淘宝/极简等首页布局）：涉及后端 themeId + 前端多套首页布局映射 + 后台可视化配置，属独立大项目，单独规划。

## 验收

- 手机端顶栏显示红色 youShop；PC 京东头不受影响。
- 结算/配送页主色为京东红（非绿）。
- 移动端首页滚动到底可见 AppFooter 分类导航与 logo-full。
- 本地构建通过；按部署铁律本地构建 + 上传 + pm2 restart（绝不在服务器构建）。