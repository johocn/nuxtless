<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";
import { formatMoney } from "../../utils/format-money";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();

const { t, locale } = useI18n();

interface PackageShipping {
  locationId: string;
  fee: number;
}

const packages = computed<PackageShipping[]>(() => {
  const raw = props.order.customFields?.packageShippingJson;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PackageShipping[]) : [];
  } catch {
    return [];
  }
});

const shippingAdjustment = computed(
  () => props.order.customFields?.shippingAdjustment ?? 0,
);
const hasAdjustment = computed(() => shippingAdjustment.value !== 0);
const adjustmentIsCharge = computed(() => shippingAdjustment.value > 0);
const adjustmentAmount = computed(() =>
  formatMoney(
    Math.abs(shippingAdjustment.value),
    props.order.currencyCode || "CNY",
    locale.value,
  ),
);
const fmt = (amount: number) =>
  formatMoney(amount, props.order.currencyCode || "CNY", locale.value);
</script>

<template>
  <div
    v-if="packages.length"
    class="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800"
  >
    <h3 class="mb-2 text-sm font-medium">
      {{ t("messages.shop.packageShipping") }}
    </h3>
    <dl class="space-y-2 text-sm">
      <div v-for="(pkg, idx) in packages" :key="idx" class="flex justify-between">
        <dt>
          P{{ idx + 1 }} · {{ t("messages.shop.warehouse") }} #{{ pkg.locationId }}
        </dt>
        <dd>{{ fmt(pkg.fee) }}</dd>
      </div>
      <div v-if="hasAdjustment" class="flex items-center justify-between">
        <dt>
          <UBadge
            :color="adjustmentIsCharge ? 'warning' : 'success'"
            variant="outline"
          >
            {{
              adjustmentIsCharge
                ? t("messages.shop.shippingAdjustmentCharge")
                : t("messages.shop.shippingAdjustmentRefund")
            }}
          </UBadge>
        </dt>
        <dd :class="adjustmentIsCharge ? 'text-warning' : 'text-success'">
          {{ adjustmentIsCharge ? "+" : "-" }}{{ adjustmentAmount }}
        </dd>
      </div>
    </dl>
  </div>
</template>
