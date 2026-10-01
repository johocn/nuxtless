<script setup lang="ts">
definePageMeta({
  title: "券码",
});

const { t } = useI18n();
const route = useRoute();

const code = computed(() => String(route.query.code || ""));
const name = computed(() => String(route.query.name || ""));
const expiresAt = computed(() => String(route.query.expiresAt || ""));
const discount = computed(() => String(route.query.discount || ""));

const qrDataUrl = ref("");
onMounted(async () => {
  if (!code.value) return;
  try {
    const QRCode = (await import("qrcode")).default;
    qrDataUrl.value = await QRCode.toDataURL(code.value, { width: 420, margin: 1 });
  } catch {
    qrDataUrl.value = "";
  }
});

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
