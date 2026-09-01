import { useAsyncData } from "#imports";
import { parseOrderListConfig, orderListLayout, type OrderListConfig, type OrderListLayout } from "../utils/order-config";

export function useOrderListConfig() {
  const { data } = useAsyncData(
    "order-list-config",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields?.orderListConfig ?? null;
    },
    { server: true },
  );
  const config = computed<OrderListConfig | null>(() => parseOrderListConfig(data.value ?? null));
  const layout = computed<OrderListLayout>(() => orderListLayout(config.value));
  return { config, layout };
}