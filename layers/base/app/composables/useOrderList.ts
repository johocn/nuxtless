import { SortOrder } from "~~/types/default";
import type { OrderTabKey } from "../utils/order-state";
import { tabOfState } from "../utils/order-state";

/**
 * 订单列表取数（card / cn / jd / mall 四版式共用）。
 * 过滤口径：幽灵单（0 件 0 元）与商户子单（type=Seller）不上榜。
 */
export async function useOrderList(activeTab: Ref<OrderTabKey>) {
  const take = ref(10);
  const loading = ref(true);

  const { data, refresh, error } = await useAsyncGql(
    "GetOrderHistory",
    computed(() => ({
      options: { sort: { createdAt: SortOrder.DESC }, take: take.value },
    })),
    { immediate: false, server: false },
  );

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

  onMounted(async () => {
    await refresh();
    loading.value = false;
  });

  return { loading, error, rawItems, orders, filtered, total, loadMore, changed };
}