import { SortOrder } from "~~/types/default";
import type { OrderTabKey } from "../utils/order-state";
import { tabOfState } from "../utils/order-state";

/**
 * 订单列表取数（card / cn / jd / mall 四版式共用）。
 * 过滤口径：幽灵单（0 件 0 元）与商户子单（type=Seller）不上榜。
 *
 * 必须保持「同步调用」（调用方不要 await 本函数）：`<script setup>` 顶层 await 会让
 * setup 变成 async setup，Vue 在 setup 返回 Promise 后立即清空 `currentInstance`，
 * 之后注册的 `onMounted` 会被静默丢弃（生产构建无告警），表现为列表永远停在加载态。
 * 因此这里用 `useAsyncGql` 的 immediate 在 setup 阶段同步发起请求，加载态由
 * pending / error / data 推导，不依赖任何生命周期钩子。
 */
export function useOrderList(activeTab: Ref<OrderTabKey>) {
  const take = ref(10);

  const { data, refresh, error, pending } = useAsyncGql(
    "GetOrderHistory",
    computed(() => ({
      options: { sort: { createdAt: SortOrder.DESC }, take: take.value },
    })),
    { server: false },
  );

  // SSR 阶段不取数（server:false）→ data 为空视为加载中，保证首帧与客户端一致；
  // 请求失败时让位给模板里的 error 分支。
  const loading = computed(() => !error.value && (pending.value || !data.value));

  const rawItems = computed(() => data.value?.activeCustomer?.orders?.items ?? []);
  const orders = computed(() =>
    // 幽灵单（0 件 0 元）过滤：加购物车自动新建的空单 / 取消失败遗留空单不上榜
    // 商户子单过滤：cross-channel 下单产生的 type=Seller 子订单仅面向商户结算/履约，
    // 客户视角只展示自己的聚合单（type=Aggregate/Regular），否则会"一单变两单"
    rawItems.value.filter(
      (o) =>
        Number((o as any).totalQuantity ?? 0) > 0 &&
        (o as any).type !== "Seller",
    ),
  );
  const total = computed(
    () => data.value?.activeCustomer?.orders?.totalItems ?? 0,
  );
  const filtered = computed(() =>
    activeTab.value === "ALL"
      ? orders.value
      : orders.value.filter((o) => tabOfState(o.state) === activeTab.value),
  );

  async function loadMore() {
    take.value += 10;
    await refresh();
  }
  async function changed() {
    await refresh();
  }

  return { loading, error, rawItems, orders, filtered, total, loadMore, changed };
}