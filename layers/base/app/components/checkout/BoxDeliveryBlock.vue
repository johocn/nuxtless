<script lang="ts">
import { reactive } from "vue";
// 模块级共享选择状态：CheckoutPerBoxList 按租户分区渲染会产生多个块实例，
// 每箱配送方式选择必须跨实例共享（提交校验按全箱遍历读取，任一实例注册的 submitDelivery 都能读到全部选择）。
const methodSel = reactive<Record<string, string>>({});
</script>

<script setup lang="ts">
// 配送方式块（物流箱专用）：渲染 type==='delivery' 的箱，每个物流箱单选「物流配送方式」。
// 选择即写库（setOrderBoxShippingMethod(…, pickupLocationId=null)）。
// submitDelivery 校验每箱已有生效配送方式（默认取 defaultShippingMethodId，onMounted 兜底应用）。
// 支持 :boxes 限定渲染范围（CheckoutPerBoxList 按租户分区传入）；:bare 去掉外层 section 标题容器（卡片版式）。
import type { OrderBoxInfo } from "~~/types/order";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const props = defineProps<{ boxes?: OrderBoxInfo[]; bare?: boolean }>();

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();

const { orderBoxes } = storeToRefs(orderStore);
const allDeliveryBoxes = computed<OrderBoxInfo[]>(() =>
  (orderBoxes.value ?? []).filter((b) => b.type === "delivery"),
);
// 渲染范围：传入 boxes 时用传入的（租户分区），否则全部物流箱（legacy 整块）
const boxes = computed<OrderBoxInfo[]>(() => props.boxes ?? allDeliveryBoxes.value);

// 行级/整箱选择状态（模块单例，与 BoxLines 及其它汇总共享）
const lineSel = usePerBoxSelection();

/** 该箱「被选行」lineTotal 求和（未选行不计入箱小计） */
function boxSubtotal(box: OrderBoxInfo): number {
  let sum = 0;
  for (const l of box.lines ?? []) {
    if ((lineSel.selection[box.boxKey]?.[l.orderLineId] ?? 0) > 0) sum += l.lineTotal;
  }
  return sum;
}

function methodName(id: string): string {
  for (const box of allDeliveryBoxes.value) {
    const m = box.availableShippingMethods?.find((s) => s.id === id);
    if (m) return m.name;
  }
  return id;
}

function defaultMethodId(box: OrderBoxInfo): string {
  return String(
    box.defaultShippingMethodId ?? box.availableShippingMethodIds?.[0] ?? "",
  );
}

async function applyBox(box: OrderBoxInfo, methodId: string, silent = false) {
  if (!methodId) return;
  orderStore.error = null;
  await orderStore.setOrderBoxShippingMethod(box.boxKey, methodId, null);
  if (orderStore.error && !silent) {
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
  }
}

function chooseLogistics(box: OrderBoxInfo, methodId: string) {
  methodSel[box.boxKey] = methodId;
  void applyBox(box, methodId);
}

onMounted(() => {
  // 兜底应用：让每箱初始即有生效配送方式（按全箱遍历，跨实例幂等）
  for (const box of allDeliveryBoxes.value) {
    if (methodSel[box.boxKey]) continue;
    const m = defaultMethodId(box);
    if (m) {
      methodSel[box.boxKey] = m;
      void applyBox(box, m, true);
    }
  }
});

// 提交：确保每个物流箱都有生效配送方式（全箱遍历，与渲染分区无关）
flow.submitFns.submitDelivery = async () => {
  for (const box of allDeliveryBoxes.value) {
    const m = methodSel[box.boxKey] ?? defaultMethodId(box);
    if (!m) {
      orderStore.error = t("messages.checkout.needBoxDelivery");
      toast.add({
        title: t("messages.general.shippingSelect"),
        description: orderStore.error,
        color: "error",
      });
      return false;
    }
    await applyBox(box, m, true);
    if (orderStore.error) {
      toast.add({
        title: t("messages.general.shippingSelect"),
        description: orderStore.error,
        color: "error",
      });
      return false;
    }
  }
  return true;
};
</script>

<template>
  <section
    :aria-labelledby="bare ? undefined : 'box-delivery-heading'"
    :class="bare ? '' : 'rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900'"
  >
    <h3
      v-if="!bare"
      id="box-delivery-heading"
      class="mb-4 font-medium text-neutral-900 dark:text-neutral-100"
    >
      {{ t("messages.checkout.deliveryMethod") }}
    </h3>

    <UAlert
      v-if="!boxes.length"
      icon="i-lucide-truck"
      color="warning"
      variant="soft"
      :title="t('messages.checkout.noShippingMethod')"
      :description="t('messages.checkout.noShippingMethodDesc')"
    />

    <div v-else class="space-y-4">
      <div
        v-for="box in boxes"
        :key="box.boxKey"
        class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p class="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            :checked="lineSel.isBoxChecked(box.boxKey)"
            class="h-4 w-4 shrink-0 accent-primary-500"
            @change="lineSel.toggleBox(box.boxKey, ($event.target as HTMLInputElement).checked)"
          />
          <span class="h-3.5 w-1 rounded-sm bg-primary-500" />
          <span>{{ box.profileName }}</span>
          <span class="rounded-sm bg-primary-50 px-1.5 py-0.5 text-[11px] font-normal text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
            {{ t("messages.checkout.logisticsDelivery") }}
          </span>
          <span class="text-xs font-normal text-neutral-400">{{ box.tenantName }}</span>
        </p>

        <!-- 该箱商品明细（可勾选/步进/删除，行级选择由 CheckoutBoxLines 复用 usePerBoxSelection） -->
        <ul
          v-if="(box.lines ?? []).length"
          class="-mx-4 mb-3 border-b border-dashed border-neutral-200 dark:border-neutral-800"
        >
          <CheckoutBoxLines :box="box" />
        </ul>

        <template v-if="(box.availableShippingMethodIds ?? []).length">
          <p class="mb-1 text-xs text-neutral-500">{{ t("messages.checkout.boxLogisticsOption") }}</p>
          <URadioGroup
            :model-value="methodSel[box.boxKey] ?? ''"
            @update:model-value="(v: string) => chooseLogistics(box, v)"
            indicator="hidden"
            variant="table"
            orientation="horizontal"
            :items="(box.availableShippingMethodIds ?? []).map((id) => ({ label: methodName(String(id)), value: String(id) }))"
            :ui="{ item: 'w-full' }"
            :disabled="orderStore.loading"
          />
        </template>

        <p
          v-if="!methodSel[box.boxKey]"
          class="mt-2 text-xs text-neutral-400 dark:text-neutral-500"
        >
          {{ t("messages.checkout.needBoxDelivery") }}
        </p>

        <!-- 该箱运费与小计（含税口径，与分账金额一致） -->
        <dl class="mt-3 space-y-1 border-t border-dashed border-neutral-200 pt-2 text-xs text-neutral-500 dark:border-neutral-800">
          <div v-if="(box.shippingCost ?? 0) > 0" class="flex items-center justify-between">
            <dt>{{ t("messages.checkout.shipping") }}</dt>
            <dd class="text-neutral-700 dark:text-neutral-300">
              <template v-if="(box.shippingDiscount ?? 0) > 0">
                <s class="text-neutral-400">¥{{ ((box.shippingCost + box.shippingDiscount) / 100).toFixed(2) }}</s>
                <span class="ml-1 text-red-500">-¥{{ (box.shippingDiscount / 100).toFixed(2) }}</span>
                <span class="ml-1">= ¥{{ (box.shippingCost / 100).toFixed(2) }}</span>
              </template>
              <template v-else>¥{{ (box.shippingCost / 100).toFixed(2) }}</template>
            </dd>
          </div>
          <div class="flex items-center justify-between font-medium text-neutral-700 dark:text-neutral-300">
            <dt>{{ t("messages.checkout.subtotal") }}</dt>
            <dd>¥{{ (boxSubtotal(box) / 100).toFixed(2) }}</dd>
          </div>
        </dl>

        <!-- 该箱优惠券行（整单一券，入口抽屉） -->
        <div class="mt-2 border-t border-dashed border-neutral-200 pt-1 dark:border-neutral-800">
          <CheckoutBoxCouponSelect :box="box" />
        </div>
      </div>
    </div>
  </section>
</template>

<style lang="css" scoped></style>
