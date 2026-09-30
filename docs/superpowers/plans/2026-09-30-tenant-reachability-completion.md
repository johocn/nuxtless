# 多租户渠道「永久可达」补全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐多租户渠道「永久可达」的三块缺口 —— 错误页（两类 404 + 500）、自定义域名直达、店铺切换器 —— 并让 vshop 的未知租户行为与 nshop 一致。

**Architecture:** 租户解析收敛到 Nitro 中间件一处（路径首段 → 访问域名 → 默认店），错误页 / 域名直达 / 切换器三处消费同一结果。后端零改动（`shopChannels` 与 `resolveChannelByDomain` 已存在）。域名命中且 URL 无租户段时服务端 301 归一为 `/<code>`，从而站内链接天然带前缀。

**Tech Stack:** Nuxt 4.4 + Vue 3.5 + `@nuxtjs/i18n` 10 + Nuxt UI 4 + `nuxt-graphql-client` + Nitro（nshop）；uni-app H5 + Pinia（vshop）。

**设计文档：** `docs/superpowers/specs/2026-09-30-tenant-reachability-completion-design.md`

---

## 前置事实（已在本仓库源码核实，实施时可直接采信）

| 事实 | 位置 |
| --- | --- |
| `error.vue` **整体替换 `app.vue`**，不继承 `layouts/default.vue`，因此错误页拿不到 `app.vue` 的 `UApp` 外壳与 `AppHeader`/`AppFooter` | `node_modules/nuxt/dist/app/components/nuxt-root.vue:4-16`（`v-else-if="error"` 分支与 `AppComponent` 互斥） |
| `AppHeader` / `AppFooter` 由 `layouts/default.vue` 渲染，而非 `app.vue` | `app/layouts/default.vue:92,96` |
| i18n 以 `zhMessages`（`zh-CN.ts`）为**完整基底**，其余 11 语言用 `zhFallbackLocale({...})` 递归覆盖；缺词条自动回退中文 | `layers/base/i18n/locales/merge.ts:40-49`；11 个语言文件首个 import 均为 `zhFallbackLocale` |
| 租户 404 只在 Vue 路由层判定，Nitro 中间件只做正向命中 | `server/middleware/tenant.ts:20-39`、`layers/base/app/middleware/tenant.global.ts:14-46` |
| 运行时租户表 SWR：TTL 60s、超时 3s、负向缓存 + 种子降级 | `server/utils/tenant-registry.ts:35-36,97-132` |
| 切租户 = 切 `vendure-token` 请求头；`activeOrder` 按 channel 查询（Vendure 自带隔离，购物车不跨渠道复用） | `layers/base/app/composables/useTenantChannel.ts:40-47`、`useGqlSession.ts:44-46,68-74` |
| nshop GraphQL 操作放 `layers/base/gql/queries/*.gql`，用 `useAsyncGql("<OpName>")` 消费 | `layers/base/gql/queries/`（18 个文件）、`useAsyncGql(` 的 15 处调用 |
| `pages/` 下**无** catch-all `[...slug].vue`，也**无** `error.vue` | `layers/base/app/pages/**` 文件清单、`Glob **/error.vue` 无匹配 |
| vshop C 端**无 i18n**（`src/` 下无 `locale/`）；`initTenant()` 在 `src/App.vue:42` 被调用 | `Glob vshop/src/locale/**` 无匹配 |

---

## File Structure

### 新增

| 文件 | 职责 |
| --- | --- |
| `nshop/layers/base/gql/queries/tenant.gql` | `ShopChannelsForSwitcher` 查询（店铺清单，切换器与错误页共用） |
| `nshop/layers/base/app/composables/useTenantSwitcher.ts` | 店铺清单 + 切换动作（`?fresh=1` 强制刷新 + 整页导航），页头与错误页共用 |
| `nshop/layers/base/app/error.vue` | 全局错误页（两类 404 + 500），自带站点外壳、i18n、恢复出口 |
| `nshop/layers/base/app/components/header/TenantSelector.vue` | 页头店铺切换器（自动注册为 `HeaderTenantSelector`） |

### 修改

| 文件 | 改动 |
| --- | --- |
| `nshop/server/utils/tenant-registry.ts` | 新增 `resolveTenantByDomain`（按 host 解析 + 60s 正向/负向缓存）；`?fresh=1` 强制刷新与 5s 频控 |
| `nshop/server/api/tenant/resolve.get.ts` | 支持 `fresh=1` |
| `nshop/server/middleware/tenant.ts` | 域名命中且无租户段时 301 归一；排除清单补 `/shop-api` 等 |
| `nshop/layers/base/app/middleware/tenant.global.ts` | 去掉硬编码中文，改传 `data: { kind: "shop-not-found" }` |
| `nshop/layers/base/app/components/AppHeader.vue` | `#right` 接入 `HeaderTenantSelector`；移动端 `#body` 收纳 |
| `nshop/layers/base/i18n/locales/zh-CN.ts` | `zhMessages` 增 `nav.selectShop` / `nav.officialShop` / `error.*`（13 键） |
| `nshop/layers/base/i18n/locales/{en-US,bg-BG,ru-RU,fa-IR,de-DE,es-ES,fr-FR,it-IT,pt-BR,ja-JP,ko-KR}.ts` | 同步 11 语言的 `error` 覆盖块 |
| `vshop/src/stores/tenant.ts` | 未知租户标记 `tenantInvalid` |
| `vshop/src/App.vue` | 未知租户时弹明示提示（替代静默回退） |

---

## Task 0: 前置验证（阻塞项，先做）

**Files:** 无（只读验证）

- [x] **Step 1: 验证购物车不跨渠道复用** — ✅ **已验证通过**（2026-09-30 实测线上）

```powershell
$default = "cnx87ezvmjx8nn3bth6c"
$t1 = "a6fn474hhiqasmyiyrfl"   # t1「新生」
```

**实测结果**：同一 WebSession 下，`default` 渠道 `addItemToOrder` → `Order#169 (BRQHJX36GHG5G53D)`；
换成 `vendure-token: a6fn474hhiqasmyiyrfl` 后 `activeOrder` 返回 `null`。

→ **购物车按渠道隔离成立**，「切店 = 整页导航」前提有效，Task 6 可照原设计实施。
（若两次返回**同一个** order id → 停止，回到设计文档修订「切店 = 整页导航」这一前提。）

- [x] **Step 2: 验证店铺域是否指向同一 Nuxt 实例** — ⚠️ **线上暂无此类域名（见 Step 3）**

```powershell
Invoke-WebRequest -Uri "https://<店铺域>/" -UseBasicParsing | Select-Object StatusCode
(Invoke-WebRequest -Uri "https://<店铺域>/" -UseBasicParsing).Content -match "/_nuxt/"
```

预期：`StatusCode = 200` 且 `True`（返回的是 nshop 首页 HTML）。
若返回 nginx 默认页或其它站点 → 需先在部署侧把该域 `server_name` 指到 nshop 实例，否则 Task 5 无法在线上成立。

**实测结果**：线上目前**没有任何**绑定到非默认渠道、且指向 nshop 实例的自定义域名
（`e.joho.cn` 虽已登记但绑在**默认渠道**，且它服务的是 vshop）。
→ Task 5 代码可照原设计实施；但**线上验收前需人工补一步**：给某个渠道（如 `t1`）配一个
`customDomains` 值，并把该域 nginx `server_name` 指到 nshop 实例。此动作属部署侧，需用户配合。

- [x] **Step 3: 列出已有 customDomains 与渠道 token** — ✅ **已获取**（2026-09-30 实测线上）

Step 3 原方案用 `admin-api` + superadmin token 读 `channels`；实测**无需 token 也能等价完成**——
公开查询 `shopChannels` 直接给出全部渠道 code/token，`resolveChannelByDomain(host)` 单查域名归属：

```powershell
# 渠道清单（code / token / name / isOfficial / isDefault）—— 公开，无需鉴权
$body = '{"query":"{ shopChannels { code token name tenantNo isOfficial isDefault } }"}'
Invoke-RestMethod -Uri "https://www.youshop.cn/shop-api" -Method Post -ContentType "application/json" -Body $body

# 域名归属（逐个 host 单查）
$body = '{"query":"{ resolveChannelByDomain(host: \"e.joho.cn\") { token code } }"}'
Invoke-RestMethod -Uri "https://www.youshop.cn/shop-api" -Method Post -ContentType "application/json" -Body $body
```

**实测结果**：
1. 渠道共 **25** 个（`__default_channel__` 优商铺 + `official-01..20` + `t1..t3` + `test-marketplace-shop`），
   token 齐备（如 `t1` = `a6fn474hhiqasmyiyrfl`、`t2` = `66ruvnhh34svhckaa2i`、`t3` = `jmjobmq5lak9o50kevf`）。
2. **`customDomains` 线上仅一条**：`e.joho.cn` → `__default_channel__`（token `cnx87ezvmjx8nn3bth6c`）。
   `www.youshop.cn` / `shop.youshop.cn` / `youshop.cn` / `t1.youshop.cn` 查询均返回 `null`。
3. **对 Task 5 的关键确认**：`resolveTenantByDomain` 已对 `code === "__default_channel__"` 返回 `null`，
   因此即便 nshop 服务到 `e.joho.cn`，也**不会**被 301 成 `/__default_channel__/...`（Task 5 Step 1 代码 `:851` 已覆盖）。

---

## Task 1: i18n 词条（13 error 键 + 2 nav 键 × 12 语言包）— ✅ 已完成

> **实施记录（偏离原计划，已按实际结构修正）**：原计划假设「新增 error 块」，实测**每个语言包早已存在 `error` 块**
> （`zhMessages.error` 10 键；各语言在 `zhFallbackLocale(arg1, arg2)` 的 arg1 / arg2 各有一块）。
> 同对象内再加一个 `error` 会触发**重复键**（后者覆盖前者，新词条被静默丢弃）。
> 实际做法：把 13 个新键**并入各文件 arg1 的既有 `error` 块**（锚点 `    error: {\n      invalidPasswordResetLink:`，全文件唯一）。
> 另：原计划漏了 `nav.selectShop` / `nav.officialShop` 的 11 语言译文，已一并对齐（否则非中文站会回退中文，违反多语言硬规范）。
> 校验：`node <temp>/i18n-check.js` → `files=12 parsed=12 parseFailures=0 duplicateKeys=0`，每文件 `errorKeys=23`、`navOk=true`。

**Files:**
- Modify: `nshop/layers/base/i18n/locales/zh-CN.ts`（在 `zhMessages.nav` 内追加 2 键，并新增 `error` 块）
- Modify: `nshop/layers/base/i18n/locales/{en-US,bg-BG,ru-RU,fa-IR,de-DE,es-ES,fr-FR,it-IT,pt-BR,ja-JP,ko-KR}.ts`

- [ ] **Step 1: 在 `zhMessages` 补中文词条**

`layers/base/i18n/locales/zh-CN.ts` 中 `nav` 块（当前结束于 `qualityZone: '品质专区',`，第 60 行）追加两行：

```ts
      qualityZone: '品质专区',
      selectShop: '选择店铺',
      officialShop: '平台官方',
    },
```

然后在 `nav` 块之后、`detail` 块（第 62 行）之前插入：

```ts
    error: {
      title404: '404',
      title500: '500',
      shopNotFound: '店铺不存在',
      shopNotFoundDesc: '该店铺可能已更名或停用',
      pageNotFound: '页面不存在',
      pageNotFoundDesc: '这个页面可能已被移除',
      serverError: '服务暂时不可用',
      serverErrorDesc: '请稍后再试，或返回首页',
      backHome: '返回首页',
      chooseShop: '选择其他店铺',
      maybeLike: '你或许想去',
      switchFailed: '该店铺暂不可用，请选择其他店铺',
      cityReset: '已切换店铺，请重新选择城市',
    },
```

- [ ] **Step 2: 同步 11 个语言包的 `error` 覆盖块**

每个文件都是 `zhFallbackLocale({ ... })` 形式（首行 import、第 4 行开始传参）。在**顶层对象**里与现有 `messages` 平级的位置插入下列覆盖（即与 `messages: { ... }` 同一层级；若该文件没有 `messages` 包裹层，则直接放在传给 `zhFallbackLocale` 的对象里）。**逐文件替换 `<占位>` 为下表中该语言的文案。**

`en-US.ts`：

```ts
    error: {
      shopNotFound: 'Shop not found',
      shopNotFoundDesc: 'This shop may have been renamed or disabled',
      pageNotFound: 'Page not found',
      pageNotFoundDesc: 'This page may have been removed',
      serverError: 'Service temporarily unavailable',
      serverErrorDesc: 'Please try again later, or go back home',
      backHome: 'Back to home',
      chooseShop: 'Choose another shop',
      maybeLike: 'You may also like',
      switchFailed: 'This shop is unavailable, please choose another',
      cityReset: 'Shop switched, please select your city again',
    },
```

`bg-BG.ts`：

```ts
    error: {
      shopNotFound: 'Магазинът не е намерен',
      shopNotFoundDesc: 'Този магазин може да е преименуван или спрян',
      pageNotFound: 'Страницата не е намерена',
      pageNotFoundDesc: 'Тази страница може да е премахната',
      serverError: 'Услугата временно не е достъпна',
      serverErrorDesc: 'Опитайте отново по-късно или се върнете към началото',
      backHome: 'Към началото',
      chooseShop: 'Избор на друг магазин',
      maybeLike: 'Може да харесате',
      switchFailed: 'Този магазин е недостъпен, изберете друг',
      cityReset: 'Магазинът е сменен, изберете град отново',
    },
```

`ru-RU.ts`：

```ts
    error: {
      shopNotFound: 'Магазин не найден',
      shopNotFoundDesc: 'Возможно, магазин переименован или отключён',
      pageNotFound: 'Страница не найдена',
      pageNotFoundDesc: 'Возможно, страница была удалена',
      serverError: 'Сервис временно недоступен',
      serverErrorDesc: 'Попробуйте позже или вернитесь на главную',
      backHome: 'На главную',
      chooseShop: 'Выбрать другой магазин',
      maybeLike: 'Возможно, вам понравится',
      switchFailed: 'Этот магазин недоступен, выберите другой',
      cityReset: 'Магазин изменён, выберите город заново',
    },
```

`fa-IR.ts`：

```ts
    error: {
      shopNotFound: 'فروشگاه یافت نشد',
      shopNotFoundDesc: 'ممکن است این فروشگاه تغییر نام داده یا غیرفعال شده باشد',
      pageNotFound: 'صفحه یافت نشد',
      pageNotFoundDesc: 'ممکن است این صفحه حذف شده باشد',
      serverError: 'سرویس موقتاً در دسترس نیست',
      serverErrorDesc: 'کمی بعد دوباره تلاش کنید یا به صفحه اصلی برگردید',
      backHome: 'بازگشت به صفحه اصلی',
      chooseShop: 'انتخاب فروشگاه دیگر',
      maybeLike: 'شاید بپسندید',
      switchFailed: 'این فروشگاه در دسترس نیست، فروشگاه دیگری انتخاب کنید',
      cityReset: 'فروشگاه تغییر کرد، لطفاً شهر را دوباره انتخاب کنید',
    },
```

`de-DE.ts`：

```ts
    error: {
      shopNotFound: 'Shop nicht gefunden',
      shopNotFoundDesc: 'Dieser Shop wurde möglicherweise umbenannt oder deaktiviert',
      pageNotFound: 'Seite nicht gefunden',
      pageNotFoundDesc: 'Diese Seite wurde möglicherweise entfernt',
      serverError: 'Dienst vorübergehend nicht verfügbar',
      serverErrorDesc: 'Bitte später erneut versuchen oder zur Startseite zurückkehren',
      backHome: 'Zur Startseite',
      chooseShop: 'Anderen Shop wählen',
      maybeLike: 'Das könnte Ihnen gefallen',
      switchFailed: 'Dieser Shop ist nicht verfügbar, bitte einen anderen wählen',
      cityReset: 'Shop gewechselt, bitte Stadt neu wählen',
    },
```

`es-ES.ts`：

```ts
    error: {
      shopNotFound: 'Tienda no encontrada',
      shopNotFoundDesc: 'Es posible que esta tienda haya cambiado de nombre o esté desactivada',
      pageNotFound: 'Página no encontrada',
      pageNotFoundDesc: 'Es posible que esta página se haya eliminado',
      serverError: 'Servicio no disponible temporalmente',
      serverErrorDesc: 'Inténtalo más tarde o vuelve al inicio',
      backHome: 'Volver al inicio',
      chooseShop: 'Elegir otra tienda',
      maybeLike: 'Quizá te interese',
      switchFailed: 'Esta tienda no está disponible, elige otra',
      cityReset: 'Tienda cambiada, vuelve a elegir la ciudad',
    },
```

`fr-FR.ts`：

```ts
    error: {
      shopNotFound: 'Boutique introuvable',
      shopNotFoundDesc: 'Cette boutique a peut-être été renommée ou désactivée',
      pageNotFound: 'Page introuvable',
      pageNotFoundDesc: 'Cette page a peut-être été supprimée',
      serverError: 'Service temporairement indisponible',
      serverErrorDesc: 'Réessayez plus tard ou revenez à l’accueil',
      backHome: 'Retour à l’accueil',
      chooseShop: 'Choisir une autre boutique',
      maybeLike: 'Vous aimerez peut-être',
      switchFailed: 'Cette boutique est indisponible, choisissez-en une autre',
      cityReset: 'Boutique changée, veuillez choisir à nouveau la ville',
    },
```

`it-IT.ts`：

```ts
    error: {
      shopNotFound: 'Negozio non trovato',
      shopNotFoundDesc: 'Questo negozio potrebbe essere stato rinominato o disattivato',
      pageNotFound: 'Pagina non trovata',
      pageNotFoundDesc: 'Questa pagina potrebbe essere stata rimossa',
      serverError: 'Servizio temporaneamente non disponibile',
      serverErrorDesc: 'Riprova più tardi o torna alla home',
      backHome: 'Torna alla home',
      chooseShop: 'Scegli un altro negozio',
      maybeLike: 'Potrebbe interessarti',
      switchFailed: 'Questo negozio non è disponibile, scegline un altro',
      cityReset: 'Negozio cambiato, seleziona di nuovo la città',
    },
```

`pt-BR.ts`：

```ts
    error: {
      shopNotFound: 'Loja não encontrada',
      shopNotFoundDesc: 'Esta loja pode ter sido renomeada ou desativada',
      pageNotFound: 'Página não encontrada',
      pageNotFoundDesc: 'Esta página pode ter sido removida',
      serverError: 'Serviço temporariamente indisponível',
      serverErrorDesc: 'Tente novamente mais tarde ou volte ao início',
      backHome: 'Voltar ao início',
      chooseShop: 'Escolher outra loja',
      maybeLike: 'Talvez você goste',
      switchFailed: 'Esta loja está indisponível, escolha outra',
      cityReset: 'Loja alterada, selecione a cidade novamente',
    },
```

`ja-JP.ts`：

```ts
    error: {
      shopNotFound: 'ショップが見つかりません',
      shopNotFoundDesc: 'このショップは名称変更または停止された可能性があります',
      pageNotFound: 'ページが見つかりません',
      pageNotFoundDesc: 'このページは削除された可能性があります',
      serverError: 'サービスが一時的に利用できません',
      serverErrorDesc: 'しばらくしてから再度お試しいただくか、ホームへお戻りください',
      backHome: 'ホームへ戻る',
      chooseShop: '別のショップを選ぶ',
      maybeLike: 'こちらもおすすめ',
      switchFailed: 'このショップは利用できません。別のショップをお選びください',
      cityReset: 'ショップを切り替えました。都市を選び直してください',
    },
```

`ko-KR.ts`：

```ts
    error: {
      shopNotFound: '스토어를 찾을 수 없습니다',
      shopNotFoundDesc: '이 스토어는 이름이 변경되었거나 비활성화되었을 수 있습니다',
      pageNotFound: '페이지를 찾을 수 없습니다',
      pageNotFoundDesc: '이 페이지는 삭제되었을 수 있습니다',
      serverError: '서비스를 일시적으로 사용할 수 없습니다',
      serverErrorDesc: '잠시 후 다시 시도하거나 홈으로 돌아가세요',
      backHome: '홈으로 돌아가기',
      chooseShop: '다른 스토어 선택',
      maybeLike: '이런 상품은 어떠세요',
      switchFailed: '이 스토어를 사용할 수 없습니다. 다른 스토어를 선택하세요',
      cityReset: '스토어가 변경되었습니다. 도시를 다시 선택하세요',
    },
```

- [ ] **Step 3: 验证 12 个文件都含 `error` 块**

```powershell
$dir = "d:\zhao\nshop\layers\base\i18n\locales"
$files = Get-ChildItem $dir -Filter *.ts | Where-Object { $_.Name -notin @('merge.ts','locales.ts') }
$files | ForEach-Object {
  $hit = Select-String -Path $_.FullName -Pattern 'shopNotFound' -Quiet
  "{0,-12} {1}" -f $_.Name, $(if ($hit) { 'OK' } else { 'MISSING' })
}
```

预期：12 行全部 `OK`（`zh-CN.ts` + 11 个语言包），无 `MISSING`。

- [ ] **Step 4: 提交**

```bash
git add layers/base/i18n/locales
git commit -m "feat(i18n): 错误页词条（店铺不存在/页面不存在/服务不可用）12 语言包同步"
```

---

## Task 2: 店铺清单查询 + 切换动作 + `?fresh=1`

**Files:**
- Create: `nshop/layers/base/gql/queries/tenant.gql`
- Create: `nshop/layers/base/app/composables/useTenantSwitcher.ts`
- Modify: `nshop/server/utils/tenant-registry.ts`（文件末尾追加）
- Modify: `nshop/server/api/tenant/resolve.get.ts`

- [ ] **Step 1: 新增 GraphQL 查询**

新建 `layers/base/gql/queries/tenant.gql`：

```graphql
query ShopChannelsForSwitcher {
  shopChannels {
    code
    token
    name
    tenantNo
    isOfficial
    isDefault
  }
}
```

- [ ] **Step 2: 为 `tenant-registry.ts` 增加强制刷新频控**

在 `layers/base/app/../../server/utils/tenant-registry.ts`（即 `server/utils/tenant-registry.ts`）的 `refreshTenantRegistry` 之后追加：

```ts
/** ?fresh=1 强制刷新的最小间隔：避免被高频点击刷爆后端 */
const FORCE_MIN_INTERVAL_MS = 5_000;
let lastForceAt = 0;

/**
 * 运营侧「立即生效」入口：绕过 SWR 的 TTL 强制刷新一次租户表。
 * 5s 内重复调用直接复用上一次结果，不重复打后端。
 */
export async function refreshTenantRegistryForced(): Promise<void> {
  if (Date.now() - lastForceAt < FORCE_MIN_INTERVAL_MS) return;
  lastForceAt = Date.now();
  await refreshTenantRegistry(true);
}
```

- [ ] **Step 3: `resolve.get.ts` 支持 `fresh=1`**

把 `nshop/server/api/tenant/resolve.get.ts` 的 handler 替换为：

```ts
import { refreshTenantRegistryForced, resolveTenant } from "../../utils/tenant-registry";
import type { TenantResolve } from "../../utils/tenant-registry";

export default defineEventHandler(async (event): Promise<TenantResolve> => {
  const q = getQuery(event);
  const code = String(q.code || "").trim();
  if (!code) return { status: "none" };

  // 切换店铺前先强制刷新一次租户表，避免「后台刚启用渠道但路由仍 404」（SWR 60s 窗口）
  if (String(q.fresh || "") === "1") await refreshTenantRegistryForced();

  const hit = await resolveTenant(code);
  return hit ?? { status: "unknown", code };
});
```

- [ ] **Step 4: 新增 `useTenantSwitcher.ts`**

新建 `nshop/layers/base/app/composables/useTenantSwitcher.ts`：

```ts
import type { TenantResolve } from "./useTenantChannel";

/** 店铺清单条目（后端公开查询 shopChannels 的裁剪形态） */
export interface ShopChannelEntry {
  code: string;
  token: string;
  name: string;
  isDefault: boolean;
  isOfficial: boolean;
}

/** 店铺切换：页头 HeaderTenantSelector 与错误页「选择其他店铺」共用。
 *
 *  切换前先打 /api/tenant/resolve?fresh=1 强制刷新 Nitro 租户表，命中才跳转；
 *  跳转采用**整页导航**（external: true），确保渠道态（购物车、城市、GQL 头）彻底重置 —— 
 *  Vendure 的 activeOrder 按 channel 隔离，软导航会残留旧渠道的客户端状态。 */
export function useTenantSwitcher(opts: { server?: boolean } = {}) {
  const { data } = useAsyncGql("ShopChannelsForSwitcher", {}, {
    server: !!opts.server,
    lazy: !opts.server,
  });
  const router = useRouter();
  const route = useRoute();
  const localePath = useLocalePath();
  const { code, applyResolved } = useTenantChannel();

  const shops = computed<ShopChannelEntry[]>(() =>
    ((data.value?.shopChannels ?? []) as ShopChannelEntry[]).map((c) => ({
      code: c.code,
      token: c.token,
      name: c.name || c.code,
      isDefault: !!c.isDefault,
      isOfficial: !!c.isOfficial,
    })),
  );

  /** 强制刷新租户表并校验目标店铺可用；返回是否可用 */
  async function ensureAvailable(next: string): Promise<boolean> {
    const res = await $fetch<TenantResolve>("/api/tenant/resolve", {
      query: { code: next, fresh: 1 },
    }).catch(() => null);
    if (!res || res.status !== "ok") return false;
    applyResolved(res);
    return true;
  }

  /** 当前路径换租户段（vue-router 已按静态段优先消歧，直接用 params 重解析，不做字符串推断） */
  function samePathWith(next: string): string {
    if (!route.name) return localePath(`/${next}`);
    return router.resolve({
      name: route.name,
      params: { ...route.params, tenantCode: next },
      query: route.query,
    }).fullPath;
  }

  /** 页头切换器：保持当前页面，只换店铺 */
  async function switchTo(next: string): Promise<boolean> {
    if (!(await ensureAvailable(next))) return false;
    await navigateTo(samePathWith(next), { external: true });
    return true;
  }

  /** 错误页「选择其他店铺」：直接去目标店铺首页 */
  async function goToShopHome(next: string): Promise<boolean> {
    if (!(await ensureAvailable(next))) return false;
    await navigateTo(localePath(`/${next}`), { external: true });
    return true;
  }

  return { shops, currentCode: code, switchTo, goToShopHome };
}
```

- [ ] **Step 5: 验证接口**

```powershell
Invoke-RestMethod -Uri "https://www.youshop.cn/api/tenant/resolve?code=t1&fresh=1" | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://www.youshop.cn/api/tenant/resolve?code=t24&fresh=1" | ConvertTo-Json -Compress
```

预期：第一条 `{"status":"ok","code":"t1","token":"...","name":"..."}`；第二条 `{"status":"unknown","code":"t24"}`（t24 为停用渠道）。
（本地开发时把域名换成 `http://localhost:3000`。）

- [ ] **Step 6: 提交**

```bash
git add layers/base/gql/queries/tenant.gql layers/base/app/composables/useTenantSwitcher.ts server/utils/tenant-registry.ts server/api/tenant/resolve.get.ts
git commit -m "feat(tenant): 店铺清单查询 + 切换动作（?fresh=1 强制刷新租户表，整页导航重置渠道态）"
```

---

## Task 3: 错误页 `error.vue`（两类 404 + 500）

**Files:**
- Modify: `nshop/layers/base/app/middleware/tenant.global.ts`
- Create: `nshop/layers/base/app/error.vue`

- [ ] **Step 1: 中间件改传 `data.kind`，去掉硬编码中文**

`layers/base/app/middleware/tenant.global.ts` 第 29-34 行替换为：

```ts
  if (import.meta.server) {
    // 服务端命中结果由 Nitro 中间件给出；走到这里说明未命中 → 404
    // kind 供 error.vue 区分「店铺不存在」与「页面不存在」（错误态下 route.params 不可靠）
    const evt = useRequestEvent();
    if (evt) setResponseStatus(evt, 404);
    return showError(
      createError({ statusCode: 404, data: { kind: "shop-not-found" } }),
    );
  }
```

第 45 行替换为：

```ts
  return showError(
    createError({ statusCode: 404, data: { kind: "shop-not-found" } }),
  );
```

- [ ] **Step 2: 新建 `layers/base/app/error.vue`**

```vue
<script setup lang="ts">
import type { NuxtError } from "#app";

/** 全局错误页：整体替换 app.vue（nuxt-root 的 error 分支与 AppComponent 互斥），
 *  因此这里必须自带 UApp 外壳与站点页头页脚，不能依赖 layouts/default.vue。 */
const props = defineProps<{ error: NuxtError }>();
const { t } = useI18n();
const goHome = useTenantLocalePath();

const statusCode = computed(() => Number(props.error?.statusCode || 500));
const kind = computed(() => (props.error?.data as { kind?: string } | undefined)?.kind);

/** 三类错误：店铺不存在（居中卡片式）/ 页面不存在（左对齐 + 推荐店铺）/ 服务端错误（居中卡片式） */
const variant = computed<"shop" | "page" | "server">(() => {
  if (statusCode.value >= 500) return "server";
  if (kind.value === "shop-not-found") return "shop";
  return "page";
});

const title = computed(() =>
  variant.value === "shop"
    ? t("messages.error.shopNotFound")
    : variant.value === "page"
      ? t("messages.error.pageNotFound")
      : t("messages.error.serverError"),
);
const description = computed(() =>
  variant.value === "shop"
    ? t("messages.error.shopNotFoundDesc")
    : variant.value === "page"
      ? t("messages.error.pageNotFoundDesc")
      : t("messages.error.serverErrorDesc"),
);

const shopPickerOpen = ref(false);
/** 推荐店铺：默认渠道优先的前 3 项（服务端取数，保证错误页首帧就完整） */
const { shops, goToShopHome } = useTenantSwitcher({ server: true });
const recommended = computed(() => shops.value.slice(0, 3));
const switching = ref(false);

async function pick(code: string) {
  if (switching.value) return;
  switching.value = true;
  const ok = await goToShopHome(code);
  switching.value = false;
  if (!ok) useToast().add({ title: t("messages.error.switchFailed"), color: "error" });
}

function backHome() {
  return clearError({ redirect: goHome("/") });
}
</script>

<template>
  <UApp>
    <div class="flex min-h-svh flex-col">
      <AppHeader />
      <main class="flex flex-1 items-center justify-center px-4 py-10">
        <div v-if="variant !== 'page'" class="w-full max-w-md text-center">
          <p class="text-4xl font-bold text-primary">{{ statusCode }}</p>
          <h1 class="mt-3 text-xl font-semibold">{{ title }}</h1>
          <p class="mt-2 text-sm text-muted">{{ description }}</p>
          <div class="mt-8 flex flex-col gap-3">
            <UButton block size="lg" :label="t('messages.error.backHome')" @click="backHome" />
            <UButton
              block
              size="lg"
              color="neutral"
              variant="outline"
              :label="t('messages.error.chooseShop')"
              @click="shopPickerOpen = true"
            />
          </div>
        </div>

        <div v-else class="w-full max-w-md">
          <p class="text-4xl font-bold text-primary">{{ statusCode }}</p>
          <h1 class="mt-3 text-xl font-semibold">{{ title }}</h1>
          <p class="mt-2 text-sm text-muted">{{ description }}</p>
          <p v-if="recommended.length" class="mt-6 text-xs text-muted">
            {{ t("messages.error.maybeLike") }}
          </p>
          <div v-if="recommended.length" class="mt-2 flex flex-wrap gap-2">
            <UButton
              v-for="shop in recommended"
              :key="shop.code"
              size="sm"
              color="neutral"
              variant="soft"
              :label="shop.name"
              :loading="switching"
              @click="pick(shop.code)"
            />
          </div>
          <div class="mt-8">
            <UButton block size="lg" :label="t('messages.error.backHome')" @click="backHome" />
          </div>
        </div>
      </main>
      <AppFooter />
    </div>

    <UModal v-model:open="shopPickerOpen" :title="t('messages.error.chooseShop')">
      <template #body>
        <ul class="max-h-80 space-y-1 overflow-y-auto">
          <li v-for="shop in shops" :key="shop.code">
            <UButton
              block
              color="neutral"
              variant="ghost"
              class="justify-start"
              :label="shop.name"
              :loading="switching"
              @click="pick(shop.code)"
            >
              <template #trailing>
                <UBadge v-if="shop.isDefault" size="sm" variant="soft">
                  {{ t("messages.nav.officialShop") }}
                </UBadge>
              </template>
            </UButton>
          </li>
        </ul>
        <p v-if="!shops.length" class="py-6 text-center text-xs text-muted">
          {{ t("messages.error.switchFailed") }}
        </p>
      </template>
    </UModal>
  </UApp>
</template>
```

- [ ] **Step 3: 本地验证两类 404 与 500 的判别**

```powershell
Start-Process -FilePath "pnpm" -ArgumentList "dev" -WorkingDirectory "d:\zhao\nshop"
Start-Sleep -Seconds 25
curl.exe -s -o NUL -w "%{http_code}`n" "http://localhost:3000/t1"
curl.exe -s -o NUL -w "%{http_code}`n" "http://localhost:3000/no-such-shop-xyz"
curl.exe -s -o NUL -w "%{http_code}`n" "http://localhost:3000/no-such-page-xyz?x=1"
curl.exe -s "http://localhost:3000/no-such-shop-xyz" | Select-String "店铺不存在"
curl.exe -s "http://localhost:3000/no-such-page-xyz" | Select-String "页面不存在"
```

预期：第 1 条 `200`；第 2、3 条均 `404`（两者都会被当作租户段 → 走 `shop-not-found`）；两个 `Select-String` 分别命中对应文案。
**注意**：`/no-such-page-xyz` 在 Nuxt 里同样落进 `:tenantCode` 自由段，因此实际会走「店铺不存在」版式；「页面不存在」版式由**带已知租户前缀但路径不匹配**的场景触发，验证命令如下：

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" "http://localhost:3000/t1/no-such-page-xyz"
curl.exe -s "http://localhost:3000/t1/no-such-page-xyz" | Select-String "页面不存在"
```

- [ ] **Step 4: 手机视口截图（390×844 / dpr=2）**

复用既有脚本模式（`nshop/scripts/` 下的 Playwright 脚本）新增 3 张：店铺不存在页、页面不存在页、500 页（500 可用临时抛错的页面触发或直接跳过）。
截图存到 `nshop/docs/superpowers/manual/tenant-reachability/shots/`。

- [ ] **Step 5: 提交**

```bash
git add layers/base/app/error.vue layers/base/app/middleware/tenant.global.ts
git commit -m "feat(tenant): 新增全局错误页 error.vue（两类 404 分流 + 500，自带站点外壳与恢复出口）"
```

---

## Task 4: vshop 未知租户明示化

**Files:**
- Modify: `vshop/src/stores/tenant.ts`
- Modify: `vshop/src/App.vue`

- [ ] **Step 1: store 增加 `tenantInvalid` 标记**

在 `vshop/src/stores/tenant.ts` 中，找到现有的 `const tenantCode = ref(...)` 一组 ref 声明，紧跟其后新增：

```ts
    /** 请求的租户不存在/已停用：记下原始 code 供 UI 明示（不再静默回退） */
    const tenantInvalid = ref<string | null>(null);
```

在同文件的 `return { ... }` 中导出 `tenantInvalid`。

- [ ] **Step 2: `initTenant()` 记录无效租户**

把 `vshop/src/stores/tenant.ts` 第 85-98 行替换为：

```ts
        const fromUrl = resolveTenantFromUrl();
        const stored = fromUrl ? null : (uni.getStorageSync('tenant_code') as string) || null;
        const requested = fromUrl || stored || null;
        let code = requested || (await resolveTenantByDomain()) || 'default';

        tenantCode.value = code;
        // 传入了不存在的 code（如 ?tenant=nope）时回退平台默认店，
        // 避免停在占位态（店名显示 code、内容与默认店不一致）；同时记下原始 code 供 UI 明示。
        if (!(await loadTenantDetails(code))) {
            tenantInvalid.value = requested || code;
            code = 'default';
            tenantCode.value = code;
            await loadTenantDetails(code);
        } else {
            tenantInvalid.value = null;
        }
        await loadShopChannels();
```

- [ ] **Step 3: `App.vue` 弹明示提示**

在 `vshop/src/App.vue` 的 `onLaunch` 中，`await tenantStore.initTenant();` 与 `openTenantGate();` 之间插入：

```ts
    // 请求的店铺不存在：明示告知并引导去选择店铺（与 nshop 的 404 行为对齐，替代原先的静默回退）
    if (tenantStore.tenantInvalid) {
        const invalidCode = tenantStore.tenantInvalid;
        tenantStore.tenantInvalid = null;
        uni.showModal({
            title: '店铺不存在',
            content: `店铺「${invalidCode}」可能已更名或停用，已为你切换到平台默认店铺。`,
            confirmText: '选择其他店铺',
            cancelText: '知道了',
            success: (res: any) => {
                // #ifdef H5
                if (res.confirm) {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('tenant');
                    uni.reLaunch({ url: '/pages/home/index' });
                }
                // #endif
            },
        });
    }
```

- [ ] **Step 4: 验证**

```powershell
# 本地或线上均可：先构建/部署 web-admin 产物后访问
Invoke-WebRequest -Uri "https://e.joho.cn/?tenant=no-such-shop" -UseBasicParsing | Select-Object StatusCode
```

预期：页面能打开（H5 hash 路由不会返回 404），且**弹出「店铺不存在」模态框**，确认后落在默认店铺首页。
手机视口截图存 `vshop/web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/vshop-invalid-tenant-notice.png`。

- [ ] **Step 5: 提交**

```bash
git -C d:\zhao\vshop add src/stores/tenant.ts src/App.vue
git -C d:\zhao\vshop commit -m "feat(tenant): 未知租户由静默回退改为明示提示，与 nshop 404 行为对齐"
```

---

## Task 5: 域名直达（同域 301 归一）

**Files:**
- Modify: `nshop/server/utils/tenant-registry.ts`
- Modify: `nshop/server/middleware/tenant.ts`

- [ ] **Step 1: `tenant-registry.ts` 新增按域名解析**

在 `server/utils/tenant-registry.ts` 末尾追加：

```ts
/** Vendure 默认渠道 code：命中默认渠道时不 301（默认店本就不带前缀） */
const DEFAULT_CHANNEL_CODE = "__default_channel__";

const RESOLVE_BY_DOMAIN_QUERY = `query ResolveChannelByDomainForRegistry($host: String!) {
  resolveChannelByDomain(host: $host) { token code }
}`;

/** 域名 → 渠道（含负向缓存），TTL 与租户表一致 */
const domainCache = new Map<string, { token: string; code: string; at: number }>();

async function fetchChannelByDomain(host: string): Promise<{ token: string; code: string } | null> {
  const { public: pub } = useRuntimeConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(gqlEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "vendure-token": (pub.channelToken as string) || "",
      },
      body: JSON.stringify({
        query: RESOLVE_BY_DOMAIN_QUERY,
        variables: { host },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { resolveChannelByDomain?: { token: string; code: string } | null };
    };
    const hit = json.data?.resolveChannelByDomain;
    if (!hit?.code || hit.code === DEFAULT_CHANNEL_CODE) return null;
    return { token: hit.token, code: hit.code };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 按访问域名解析租户（一店一域）。域名清单无法枚举（后端只提供按 host 单查），
 * 因此按 host 逐条做 60s 缓存，未命中同样写入负向缓存。
 */
export async function resolveTenantByDomain(host: string): Promise<TenantHit | null> {
  const h = host.split(":")[0].toLowerCase();
  if (!h) return null;

  const cached = domainCache.get(h);
  if (cached && Date.now() - cached.at < TENANT_TTL_MS) {
    if (!cached.code) return null;
    const name = (await getTenantRegistry()).get(cached.code)?.name || cached.code;
    return { status: "ok", code: cached.code, token: cached.token, name };
  }

  const found = await fetchChannelByDomain(h);
  domainCache.set(h, found ? { ...found, at: Date.now() } : { token: "", code: "", at: Date.now() });
  if (!found) return null;

  const name = (await getTenantRegistry()).get(found.code)?.name || found.code;
  return { status: "ok", code: found.code, token: found.token, name };
}
```

- [ ] **Step 2: Nitro 中间件加 301 归一与排除清单**

把 `server/middleware/tenant.ts` 的文件头注释与 handler 替换为：

```ts
/**
 * 多租户运行时解析（Nitro 中间件）
 *
 * 职责：
 * 1. **正向命中**：URL 首段（跳过 i18n 前缀）命中已知渠道 → 写 `event.context.tenant`；
 * 2. **域名归一**：首段未命中租户时，按访问域名（customDomains）解析，命中则 301 到
 *    `/<locale?>/<code>/<原路径>`，使站内链接天然带租户前缀（域名不变）。
 *
 * 刻意不做的事：
 * - **不判 404**。Nitro 拿不到 vue-router 的匹配结果，无法区分「租户段」与「静态首段」
 *   （反例 `/en/product/foo`）。404 统一交给 `middleware/tenant.global.ts` 判定。
 * - 不处理静态资源：命中排除清单的路径直接放行，绝不 301。
 */

import { appLocales } from "../../layers/base/i18n/locales";
import { resolveTenant, resolveTenantByDomain } from "../utils/tenant-registry";
import type { TenantHit } from "../utils/tenant-registry";

const LOCALE_CODES = new Set(appLocales.map((l) => String(l.code)));

/** 301 排除清单：这些前缀下的路径永不改写（静态资源 / 接口 / 站点地图） */
const EXCLUDE_PREFIXES = [
  "/_", // /_nuxt/ /_ipx/ /_og/
  "/api/",
  "/shop-api",
  "/admin-api",
  "/images/",
  "/static/",
  "/assets/",
];

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const pathname = url.pathname;

  if (EXCLUDE_PREFIXES.some((p) => pathname.startsWith(p))) return;
  // 带扩展名的请求（favicon.ico / robots.txt / sitemap.xml / *.js 等）一律放行
  if (pathname.includes(".")) return;

  // 只对「导航请求」解析：明确声明非 HTML 且不接受任意类型的请求直接放行
  const accept = getRequestHeader(event, "accept") || "";
  if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return;

  const segments = pathname.split("/").filter(Boolean);
  let i = 0;
  // i18n strategy=prefix_except_default：默认中文无前缀，其余语言带静态前缀（/en、/ja...）
  if (segments[i] && LOCALE_CODES.has(segments[i] as string)) i++;
  const code = segments[i];

  // 1) 路径首段命中租户 → 正向命中，无需改写
  if (code) {
    const hit = await resolveTenant(code);
    if (hit) {
      (event.context as { tenant?: TenantHit }).tenant = hit;
      return;
    }
  }

  // 2) 首段未命中 → 尝试按域名解析；命中则 301 归一为带 /<code> 的路径
  const host = getRequestHeader(event, "host") || "";
  if (!host) return;
  const byDomain = await resolveTenantByDomain(host);
  if (!byDomain) return;

  const target = `/ ${[...segments.slice(0, i), byDomain.code, ...segments.slice(i)].join("/")}`.replace("/ ", "/");
  return sendRedirect(event, `${target}${url.search}`, 301);
});
```

> 实施提示：上面 `target` 的写法是为了避免行首被 Prettier 改缩进造成歧义，实际落地请直接写
> ``const target = "/" + [...segments.slice(0, i), byDomain.code, ...segments.slice(i)].join("/");``

- [ ] **Step 3: 验证 301 与排除清单**

```powershell
$H = "https://<店铺域>"
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}`n" "$H/product/x"
curl.exe -s -o NUL -w "%{http_code}`n" "$H/_nuxt/entry.js"
curl.exe -s -o NUL -w "%{http_code}`n" "https://www.youshop.cn/"
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}`n" "$H/en/product/x"
```

预期：
1. `301 https://<店铺域>/<code>/product/x`
2. `200`（或 404，取决于静态文件名是否存在）—— **关键是不得为 301**
3. `200`（平台域不 301，零回归）
4. `301 https://<店铺域>/en/<code>/product/x`（语言前缀保留在租户段之前）

- [ ] **Step 4: 提交**

```bash
git add server/utils/tenant-registry.ts server/middleware/tenant.ts
git commit -m "feat(tenant): 自定义域名直达（按 host 解析 + 同域 301 归一为 /<code>，含静态资源排除清单）"
```

---

## Task 6: 页头店铺切换器

**Files:**
- Create: `nshop/layers/base/app/components/header/TenantSelector.vue`
- Modify: `nshop/layers/base/app/components/AppHeader.vue`

- [ ] **Step 1: 新建 `header/TenantSelector.vue`**

```vue
<script setup lang="ts">
/** 页头店铺切换器：与 HeaderCitySelector 并列（同 UPopover + UButton 范式）。
 *  目录前缀 header → 自动注册为 HeaderTenantSelector。 */
const { t } = useI18n();
const localePath = useLocalePath();
const siteName = useSiteName();
const { current, code } = useTenantChannel();
const { shops, switchTo } = useTenantSwitcher();

const open = ref(false);
const switching = ref(false);

/** 未解析出租户（平台默认店）时按钮显示站点名 */
const label = computed(() => current.value?.name || siteName.value || t("messages.nav.selectShop"));

async function pick(next: string) {
  if (next === code.value) {
    open.value = false;
    return;
  }
  switching.value = true;
  const ok = await switchTo(next);
  switching.value = false;
  if (!ok) {
    useToast().add({ title: t("messages.error.switchFailed"), color: "error" });
    return;
  }
  open.value = false;
}
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      variant="ghost"
      color="neutral"
      icon="i-lucide-store"
      :label="label"
      :loading="switching"
    />

    <template #content>
      <div class="w-72 p-4">
        <p class="mb-3 text-sm font-semibold">{{ t('messages.nav.selectShop') }}</p>
        <ul v-if="shops.length" class="max-h-72 space-y-0.5 overflow-y-auto">
          <li v-for="shop in shops" :key="shop.code">
            <UButton
              block
              color="neutral"
              variant="ghost"
              class="justify-start"
              :label="shop.name"
              :loading="switching"
              :class="shop.code === code ? 'font-medium' : ''"
              @click="pick(shop.code)"
            >
              <template #trailing>
                <UBadge v-if="shop.isDefault" size="sm" variant="soft">
                  {{ t('messages.nav.officialShop') }}
                </UBadge>
                <UIcon v-else-if="shop.code === code" name="i-lucide-check" class="text-primary" />
              </template>
            </UButton>
          </li>
        </ul>
        <p v-else class="py-4 text-center text-xs text-neutral-400">
          {{ t('messages.error.switchFailed') }}
        </p>
      </div>
    </template>
  </UPopover>
</template>
```

- [ ] **Step 2: 接入 `AppHeader.vue`**

`layers/base/app/components/AppHeader.vue` 的 `#right`（第 59-64 行）改为：

```vue
    <template #right>
      <HeaderTenantSelector />
      <HeaderCitySelector />
      <SearchModal />
      <AccountMenu />
      <CartTrigger />
    </template>
```

`#body`（第 66-73 行）改为（移动端抽屉里追加一行店铺切换，避免挤占 `#right`）：

```vue
    <template #body>
      <UNavigationMenu
        :items="items"
        variant="pill"
        orientation="vertical"
        :ui="{ item: 'py-1', childItem: 'pt-2' }"
      />
      <div class="mt-2 border-t border-default pt-2">
        <HeaderTenantSelector />
      </div>
    </template>
```

- [ ] **Step 3: 验证切换行为**

```powershell
Write-Host "手动验证清单（浏览器）"
Write-Host "1. 打开 https://www.youshop.cn/t1 → 页头出现店铺名按钮"
Write-Host "2. 点开列表 → 显示全部店铺，默认店带「平台官方」标记"
Write-Host "3. 选另一家店 → 整页刷新，URL 变为 /tN/<原路径>，购物车角标归零"
Write-Host "4. 打开 https://www.youshop.cn/en/t1 → 切换后 URL 为 /en/tN/..."
```

预期：4 条全部符合。第 3 条若购物车角标未归零 → 检查 `navigateTo(target, { external: true })` 是否被写成了软导航。

- [ ] **Step 4: 手机视口截图（390×844 / dpr=2）**

截 3 张：桌面收起态、桌面展开态、移动端抽屉内展开态，存 `nshop/docs/superpowers/manual/tenant-reachability/shots/`。

- [ ] **Step 5: 提交**

```bash
git add layers/base/app/components/header/TenantSelector.vue layers/base/app/components/AppHeader.vue
git commit -m "feat(tenant): 页头店铺切换器（桌面 #right / 移动 #body），与城市选择器并列"
```

---

## Task 7: 交付收口（回归 + 截图 + 手册 + 部署）

**Files:**
- Create: `nshop/docs/superpowers/manual/tenant-reachability/index.html`（操作手册）
- Modify: `d:\zhao\.trae\documents\多租户渠道永久可达改造方案.md`（回填现状与指向 spec）
- Modify: `vshop/web-admin/docs/superpowers/manual/vshop-usemall-alignment/README.md`（§5.12.7 补 vshop 明示化）

- [ ] **Step 1: 跑既有可达性取证脚本，确认 9 项断言无回归**

```powershell
node "d:\zhao\vshop\web-admin\scripts\_tenant_reach_shots.mjs"
```

预期：9 张截图全部产出，且脚本内断言（`/t1`、`/t2`、`/t3`、`/official-01`、`/en/t1` 200；`/t24`、`/nonexistent-xyz`、`/zh/t1` 404）全部通过。

- [ ] **Step 2: 汇总截图与断言，写操作手册**

`nshop/docs/superpowers/manual/tenant-reachability/index.html` 需含：
- 机制表（路径首段 → 域名 → 默认店；401/301/404 各自触发条件）
- 断言表（本计划 Task 0/2/5/6/7 的全部 curl 命令与期望输出）
- 截图墙（两类错误页 ×3、切换器 ×3、vshop 明示提示 ×1、既有 9 张取证图）
- 后台操作说明（如何给渠道加 `customDomains`、如何停用渠道、生效窗口 ≤60s 与 `?fresh=1`）

- [ ] **Step 3: 回填方案文档**

把 `d:\zhao\.trae\documents\多租户渠道永久可达改造方案.md` 的第十一节「涉及文件清单」更新为本轮实际改动，并在文首加一行指向 spec：
`> 本轮补全的设计与验收标准见 nshop/docs/superpowers/specs/2026-09-30-tenant-reachability-completion-design.md`。

- [ ] **Step 4: 本地构建 + 部署（铁律：本地构建，服务器只解压 + pm2 restart）**

```powershell
node "d:\zhao\nshop\scripts\deploy.mjs"
```

预期：结尾输出 `[deploy] 完成`，且 `pm2 restart nshop` 后 `nshop` 状态 `online`。

- [ ] **Step 5: 线上复验**

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" "https://www.youshop.cn/t1"
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}`n" "https://<店铺域>/product/x"
curl.exe -s -o NUL -w "%{http_code}`n" "https://www.youshop.cn/no-such-shop-xyz"
```

预期：`200` / `301 https://<店铺域>/<code>/product/x` / `404`。

- [ ] **Step 6: 提交与推送**

```bash
git -C d:\zhao\nshop add docs/superpowers/manual/tenant-reachability d:\zhao\.trae\documents\多租户渠道永久可达改造方案.md
git -C d:\zhao\nshop commit -m "docs(tenant): 多租户可达性操作手册（机制/断言/截图）+ 方案文档回填"
git -C d:\zhao\nshop push
```

vshop 若在 Task 4 有改动，同步：

```bash
git -C d:\zhao\vshop add web-admin/docs/superpowers/manual/vshop-usemall-alignment/README.md
git -C d:\zhao\vshop commit -m "docs(tenant): 手册补未知租户明示化（v1.11）"
git -C d:\zhao\vshop push
```

---

## Self-Review

**1. Spec 覆盖**

| Spec 章节 | 对应任务 |
| --- | --- |
| §2.1 租户解析收敛 | Task 5 Step 2（中间件三级解析） |
| §2.2 错误页（两类 404 + 500 + i18n + 恢复出口） | Task 1、Task 3 |
| §2.3 域名直达 + 301 排除清单 | Task 5 |
| §2.4 店铺切换器（桌面/移动 + 共用 composable） | Task 2、Task 6 |
| §2.5 vshop 对齐 | Task 4 |
| §3 卡点 1/2/3/4 | Task 0 Step 1（卡点 2）、Task 2 Step 2-3（卡点 3）、Task 5 Step 2（卡点 1）、无需改代码（卡点 4） |
| §5.1 实施前验证 | Task 0 |
| §5.2 HTTP 断言 / §5.3 截图 / §5.4 回归 / §5.5 文档 | Task 3/5/6/7 |
| §7 三批独立验收 | ①Task 1-4 ②Task 5 ③Task 6，收口 Task 7 |

**2. 与 spec 的三处偏差（已在实现层收敛，方案不变）**

- spec §2.2 写「保留 AppHeader/AppFooter」→ 实现层确认 `error.vue` 会整体替换 `app.vue`，因此改为在 `error.vue` 内**显式渲染** `UApp` + `AppHeader` + `AppFooter`（Task 3 Step 2）。
- spec §3 卡点 3 写「切换器**打开时**带 `?fresh=1`」→ 实现层改为「**切换时**带 `?fresh=1`」：店铺清单走前端 GQL 直连后端，本就实时；真正受 SWR 影响的是**路由解析**，故强制刷新应发生在跳转前（Task 2 Step 3-4）。
- spec §2.2 词条清单 11 键 → 实现层 13 键（补 `switchFailed`、`cityReset`），另在 `nav` 下补 `selectShop`、`officialShop`（Task 1 Step 1）。

**3. 占位符扫描**：无 TBD / TODO / “类似 Task N”；每个改码步骤都给了完整代码块。

**4. 类型一致性**：`ShopChannelEntry` 由 `useTenantSwitcher.ts` 单点定义并导出，`error.vue` 与 `TenantSelector.vue` 均只经 composable 消费；`TenantResolve` / `TenantHit` 沿用 `useTenantChannel.ts` 与 `tenant-registry.ts` 的既有定义，未新增同名类型；`resolveTenantByDomain` 只在中间件被调用一次。

**5. 已知风险**

- `error.vue` 中渲染完整的 `AppHeader` 会在错误态下缺少 `app.vue` 预置的 `menuCollections`，导航菜单为空（不报错）。若截图显示异常，降级方案为改用极简页头（仅 `LogoElement` + 返回首页）；实施时以 Task 3 Step 4 的截图为准。
- 域名解析为每 host 首次请求增加一次后端往返（3s 超时 + 60s 缓存 + 负向缓存），失败静默降级为默认店。
