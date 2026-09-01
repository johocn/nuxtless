import { useAsyncData } from "#imports";
import {
  parseOrderDetailConfig, orderDetailLayout, orderDetailBlockVisible,
  type OrderDetailConfig, type OrderDetailLayout,
} from "../utils/order-config";

export function useOrderDetailConfig() {
  const { data } = useAsyncData(
    "order-detail-config",
    async () => {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      return res.data.value?.activeChannel?.customFields?.orderDetailConfig ?? null;
    },
    { server: true },
  );
  const config = computed<OrderDetailConfig | null>(() => parseOrderDetailConfig(data.value ?? null));
  const layout = computed<OrderDetailLayout>(() => orderDetailLayout(config.value));
  const visible = (key: string) => orderDetailBlockVisible(config.value, key);
  return { config, layout, visible };
}