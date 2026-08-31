<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
  pickupCode?: string | null;
}>();
const { t } = useI18n();

const deliveryType = computed(
  () => props.order.customFields?.deliveryType ?? "delivery",
);
const isPickup = computed(() => deliveryType.value === "pickup");
const pickupLocation = computed(
  () => props.order.customFields?.selectedPickupLocationId ?? null,
);
const pickupType = computed(() => props.order.customFields?.pickupType ?? null);
const pickupClaimed = computed(
  () => props.order.customFields?.pickupClaimed ?? false,
);

// 预留接口：物流轨迹，待后端 logistics-api-plugin 就绪后填充
const expressCompany = computed<string | null>(() => null);
const expressNo = computed<string | null>(() => null);
const trackingUrl = computed<string | null>(() => null);
// 自提核销/提货码：由父组件传入（确认页从 guestOrderLookup 概览取到）
const pickupCode = computed<string | null>(() => props.pickupCode ?? null);
</script>

<template>
  <section
    class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
  >
    <h3 class="mb-3 font-medium">{{ t("messages.order.delivery") }}</h3>

    <div v-if="isPickup" class="space-y-2 text-sm">
      <div class="font-medium">{{ pickupLocation?.name }}</div>
      <p class="text-neutral-500">{{ pickupLocation?.address }}</p>
      <p class="text-neutral-500">{{ pickupLocation?.businessHours }}</p>
      <p v-if="pickupType" class="text-neutral-500">
        {{ t("messages.order.pickupType") }}: {{ pickupType }}
      </p>
      <div class="flex items-center gap-2">
        <UBadge :color="pickupClaimed ? 'success' : 'warning'" variant="outline">
          {{
            pickupClaimed
              ? t("messages.shop.pickupClaimed")
              : t("messages.shop.pickupPending")
          }}
        </UBadge>
        <span v-if="pickupCode" class="font-mono">{{ pickupCode }}</span>
      </div>
    </div>

    <div v-else class="space-y-2 text-sm">
      <p>
        {{ t("messages.general.shippingSelect") }}:
        {{ props.order.shippingLines?.[0]?.shippingMethod?.name }}
      </p>
      <p v-if="expressNo">
        {{ t("messages.order.expressNo") }}:
        <span class="font-mono">{{ expressNo }}</span>
      </p>
      <p v-if="expressCompany">{{ t("messages.order.expressCompany") }}: {{ expressCompany }}</p>
      <slot name="tracking" :url="trackingUrl" />
    </div>

    <slot name="redeem" />
  </section>
</template>