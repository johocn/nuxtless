import type { MenuCollections } from "~~/types/collection";

/** 仅当返回体含顶部分类时视为有效数据（空结果不覆盖调用方已有值） */
function normalize(res: unknown): MenuCollections | null {
  const items = (res as { collections?: { items?: unknown[] } } | null)?.collections?.items;
  return Array.isArray(items) && items.length ? (res as MenuCollections) : null;
}

/**
 * 带超时护栏的取数：超过 timeoutMs 视为无数据（返回 null），不抛错。
 * `Promise.race` 后立即继续，不 await 超时 promise（否则会阻塞 SSR、引入 TTFB 回归）。
 * 未提供 AbortController 能力（nuxt-graphql-client 的 useGql 不透传 signal），故仅做竞速护栏。
 */
function fetchWithTimeout(
  run: () => Promise<unknown>,
  timeoutMs: number,
): Promise<MenuCollections | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const request = Promise.resolve(run())
    .then((res) => normalize(res))
    .catch(() => null);
  return Promise.race([request, guard]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * 分类菜单集合 SSR 预取（**仅首页 / 分类页**调用；其它页面不加预取，避免 TTFB 回归）。
 *
 * - 单一 `useAsyncData` key（`menu-collections-prefetch`，刻意不同于 `useState` 的 `menuCollections`，
 *   避免同名造成取数短路）：SSR 抓到数据后随 payload 下发，客户端 hydration 直接复用、**不重复请求**。
 * - 800ms 超时护栏：`GetMenuCollections` 后端实测 3.5–4.5s，超时即视为无数据；
 *   客户端填充由 `app.vue` 的 `menu-collections-bootstrap`（server:false）兜底，不阻塞 SSR 渲染。
 * - 结果写回 `useState("menuCollections")`——Header / Footer / 首页导航的唯一消费入口，契约不变。
 * - 网络取数用 setup 顶层捕获的原始 gql client（普通 async 函数，不依赖 Nuxt 实例上下文），
 *   与 app/pages/index.vue 顶部教训一致。
 */
export async function useMenuCollections() {
  const rawGql = useGql();
  const menuState = useState<MenuCollections | null>("menuCollections", () => null);

  const { data } = await useAsyncData<MenuCollections | null>(
    "menu-collections-prefetch",
    async () => {
      if (menuState.value?.collections?.items?.length) return menuState.value;
      return await fetchWithTimeout(() => rawGql({ operation: "GetMenuCollections" }), 800);
    },
    { server: true, lazy: true, default: () => menuState.value },
  );

  watchEffect(() => {
    if (data.value) menuState.value = data.value;
  });

  return { collections: menuState };
}