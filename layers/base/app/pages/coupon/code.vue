<script setup lang="ts">
import { getMyCoupons } from "~~/layers/base/app/composables/useCoupon";

definePageMeta({
  title: "券码",
});

const { t } = useI18n();
const route = useRoute();

// URL query 仅作首屏占位——本地可任意构造（伪造「满 1000 减 900」券面做社工素材），
// onMounted 后按 code 在「我的券包」中匹配回填权威字段，以服务端为准；匹配失败保持占位。
const code = computed(() => String(route.query.code || ""));
const fallbackName = computed(() => String(route.query.name || ""));
const fallbackExpiresAt = computed(() => String(route.query.expiresAt || ""));
const fallbackDiscount = computed(() => String(route.query.discount || ""));

const authName = ref("");
const authDiscount = ref("");
const authExpiresAt = ref("");
const verified = ref(false);

const qrDataUrl = ref("");
onMounted(async () => {
  if (!code.value) return;
  try {
    const myCoupons = await getMyCoupons();
    const hit = myCoupons.find((c) => c.code === code.value);
    if (hit) {
      authName.value = hit.template?.name ?? "";
      authExpiresAt.value = hit.expiredAt ?? "";
      const type = hit.template?.type;
      const value = hit.template?.discountValue ?? 0;
      authDiscount.value =
        type === "PERCENT"
          ? t("messages.coupon.discountPercent", { n: value / 10 })
          : type === "FIXED" || type === "FULL"
            ? t("messages.coupon.discountFixed", { n: value / 100 })
            : "";
      verified.value = true;
    }
  } catch {
    // 未登录/网络失败：保留 query 占位展示（核销以后端为准）
  }
  try {
    const QRCode = (await import("qrcode")).default;
    qrDataUrl.value = await QRCode.toDataURL(code.value, { width: 420, margin: 1 });
  } catch {
    qrDataUrl.value = "";
  }
});

const name = computed(() => (verified.value ? authName.value : fallbackName.value));
const discount = computed(() => (verified.value ? authDiscount.value : fallbackDiscount.value));
const expiresAt = computed(() => (verified.value ? authExpiresAt.value : fallbackExpiresAt.value));

const expiresText = computed(() => {
  if (!expiresAt.value) return "";
  const d = new Date(expiresAt.value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
});
</script>

<template>
  <main class="container my-14">
    <div
      class="mx-auto flex max-w-md flex-col items-center rounded-xl border border-(--ui-border) bg-(--ui-bg-elevated) p-8"
    >
      <p class="text-center text-xl font-bold">{{ name }}</p>
      <p v-if="discount" class="mt-2 text-lg font-bold text-(--ui-primary)">
        {{ discount }}
      </p>
      <img
        v-if="qrDataUrl"
        :src="qrDataUrl"
        alt="券码"
        class="my-8 h-72 w-72 rounded"
      />
      <p class="font-mono text-3xl font-extrabold tracking-[0.25em]">{{ code }}</p>
      <p v-if="expiresText" class="mt-4 text-sm text-(--ui-text-muted)">
        {{ t("messages.coupon.codeValidUntil") }} {{ expiresText }}
      </p>
      <p class="mt-8 text-center text-sm leading-relaxed text-(--ui-text-muted)">
        {{ t("messages.coupon.codeTip") }}
      </p>
    </div>
  </main>
</template>
