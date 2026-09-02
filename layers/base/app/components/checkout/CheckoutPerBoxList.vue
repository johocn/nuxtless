<script setup lang="ts">
// 统一逐箱卡片渲染器（cn/jd 共用）：从 orderStore.orderBoxes 取箱，
// 按「租户分区 → 租户内档案分箱」渲染：每个租户一个区块头（商户名），
// 区内渲染该租户的各配送箱卡（物流/自提）。
// 每张箱卡 = 箱头（档案名 + 类型徽标 + 整箱勾选）+ 商品行（CheckoutBoxLines）
//           + 配送方式单选（物流）/ 自提点（自提）+ 运费券小计 + 优惠券行（CheckoutBoxCouponSelect）。
// 配送/自提逻辑复用 CheckoutBoxDeliveryBlock / CheckoutBoxPickupBlock（bare 模式），不重复实现。
import type { OrderBoxInfo } from "~~/types/order";

const orderStore = useOrderStore();

const { orderBoxes } = storeToRefs(orderStore);

interface TenantGroup {
  key: string;
  tenantName: string;
  deliveryBoxes: OrderBoxInfo[];
  pickupBoxes: OrderBoxInfo[];
}

const tenantGroups = computed<TenantGroup[]>(() => {
  const map = new Map<string, TenantGroup>();
  for (const box of orderBoxes.value ?? []) {
    const key = box.tenantChannelId ?? box.tenantName ?? "default";
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        tenantName: box.tenantName ?? "",
        deliveryBoxes: [],
        pickupBoxes: [],
      };
      map.set(key, g);
    }
    if (box.type === "delivery") g.deliveryBoxes.push(box);
    else g.pickupBoxes.push(box);
  }
  return [...map.values()];
});

// 存在任意自提箱需联系方式才统一渲染收货人/电话子块（卡片版式只渲染一次，避免多实例重复）
const hasPickupContactBox = computed(() =>
  (orderBoxes.value ?? []).some((b) => b.type === "pickup" && b.requiresContact),
);
</script>

<template>
  <div class="space-y-6">
    <template v-for="tenant in tenantGroups" :key="tenant.key">
      <!-- 租户区块头（商户名） -->
      <div class="flex items-center gap-2">
        <span class="h-4 w-1 rounded-sm bg-primary-500" />
        <h3 class="text-base font-medium text-neutral-900 dark:text-neutral-100">
          {{ tenant.tenantName }}
        </h3>
      </div>

      <!-- 区内渲染该租户的物流/自提箱卡（bare：只出卡片，无外层 section 标题） -->
      <div class="space-y-4">
        <CheckoutBoxDeliveryBlock
          v-if="tenant.deliveryBoxes.length"
          :boxes="tenant.deliveryBoxes"
          bare
        />
        <CheckoutBoxPickupBlock
          v-if="tenant.pickupBoxes.length"
          :boxes="tenant.pickupBoxes"
          bare
          :render-contact="false"
        />
      </div>
    </template>

    <!-- 收货人/电话：需联系方式的自提单统一渲染一次（与自提点连成一体） -->
    <CheckoutPickupContactBlock v-if="hasPickupContactBox" />
  </div>
</template>

<style lang="css" scoped></style>
