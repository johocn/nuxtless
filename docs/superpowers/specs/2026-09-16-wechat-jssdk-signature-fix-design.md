# 微信 JS-SDK 签名未登录绑定修复（nshop）

- 日期：2026-09-16
- 状态：已确认（方案甲）
- 范围：nshop（www.youshop.cn）微信内转发卡片即时注入标题/描述/图片

## 1. 背景与问题

用户实测：微信内打开商品详情页 → 转发"发送给朋友"，分享卡片**标题、描述、图片全部为空**。且该现象对老链接与带新参数 `?f=wxv4c` 的新链接均复现。

此前已完成 og:image 兜底链 + 体积压缩 + 版本 v4（见 `2026-09-16-wechat-share-image-fix-design.md`），og 链路在服务端验证正常。

## 2. 根因（已实测确认）

微信内分享卡片有两条数据来源，**任一即时生效即可显示完整卡片**：

| 路径 | 机制 | 实测结论 |
|---|---|---|
| A. JS-SDK 即时注入 | `wx.config` + `updateAppMessageShareData/updateTimelineShareData` 直接注入标题/描述/图，即时生效、不受微信服务器缓存影响 | **未登录用户不绑定**：`fetchJssdkSignature` 取 `sessionStorage.youshop_sso_base_url`（仅登录流程写入），未登录为空 → 返回 null → `WechatShare.bindShare` 早退，`wx.config` 从不执行 |
| B. 微信服务器 og 快照 | 微信按链接预抓取页面 og 数据缓存 | 服务端对**所有 UA（含微信 iOS/Android）**返回完整 `og:title`/`og:image`，200 无拦截；但微信服务器对未预抓/无快照的 URL（URL 编码形式、带新参数）快照为空 → 卡片全无数据 |

**结论**：未登录用户在微信内转发时 JS-SDK 未绑定 → 卡片完全依赖微信服务器 og 快照 → 快照为空/未生成时卡片全空。核心修复点是让**所有用户在微信内打开即完成 JS-SDK 绑定**，即时注入卡片数据，绕开微信 og 快照。

## 3. 修复设计（方案甲）

让 `fetchJssdkSignature` 在 sessionStorage 无 baseUrl 时，**从当前渠道 `ssoProviders` 动态取 zhao-sso provider 的 baseUrl**（与 vshop 09-15 已验证方案同款），保证未登录用户也能签名。

### 3.1 改动点

文件：`layers/base/app/composables/useSso.ts` → `fetchJssdkSignature`

```
baseUrl 优先级：
  sessionStorage.youshop_sso_base_url（登录流程写入，兼容已登录用户）
    → 缺失时：fetchProviders()（GraphQL ssoProviders，filter protocol==='zhao-sso'）取 [0].baseUrl
    → 仍缺失：返回 null（静默降级为依赖 og 快照，保持现状兜底）
```

失败仍 catch 返回 null，不阻塞页面渲染；`WechatShare.bindShare` 静默降级逻辑不变。

### 3.2 依赖复用

`fetchProviders()` 已在 `useSso` 作用域内定义（用 `useGqlHostUrl` + `useTenantChannel` 动态取，无硬编码域名），直接复用，不新增请求设施、不引入新依赖。

## 4. 变更文件清单

- `layers/base/app/composables/useSso.ts`：`fetchJssdkSignature` 增加 ssoProviders 动态兜底（唯一改动文件）

## 5. 验证计划

1. 本地构建 `npm run build` 成功。
2. 部署 `scripts/deploy.mjs` → www.youshop.cn。
3. **真机验证**（占用微信用户已登录与未登录两种状态）：
   - 微信内打开商品页 → Network 可见 `POST {baseUrl}/v1/auth/jssdk-signature` 成功返回 `{appId,timestamp,nonceStr,signature}`（未登录时也能看到该请求，证明动态兜底生效）。
   - 转发"发送给朋友"，卡片标题/描述/图片即时正确。
   - 手机视口截图（390×844）补充操作手册。

## 6. 不做事项（本次范围外）

- **og 快照/缓存**：微信服务器侧快照不受我们控制；JS-SDK 绑定后微信内转发不再依赖它。桌面/其它场景的 og 已在前序修复中保障。
- **og:image 改投静态图（方案乙）**：已证服务端抓取正常，非主因，记录延后。
- 分享卡视觉/版式调整：保持现状。