<script setup lang="ts">
import type { NuxtError } from "#app";

/** 全局错误页：整体替换 app.vue（nuxt-root 的 error 分支与 AppComponent 互斥），
 *  因此这里必须自带 UApp 外壳与站点页头页脚，不能依赖 layouts/default.vue。 */
const props = defineProps<{ error: NuxtError }>();
const { t } = useI18n();
const goHome = useTenantLocalePath();

const statusCode = computed(() => Number(props.error?.statusCode || 500));
const kind = computed(() => (props.error?.data as { kind?: string } | undefined)?.kind);

/** 三类错误：店铺不存在（居中卡片式）/ 页面不存在（左对齐 + 推荐店铺）/ 服务端错误（居中卡片式） */
const variant = computed<"shop" | "page" | "server">(() => {
  if (statusCode.value >= 500) return "server";
  if (kind.value === "shop-not-found") return "shop";
  return "page";
});

const title = computed(() =>
  variant.value === "shop"
    ? t("messages.error.shopNotFound")
    : variant.value === "page"
      ? t("messages.error.pageNotFound")
      : t("messages.error.serverError"),
);
const description = computed(() =>
  variant.value === "shop"
    ? t("messages.error.shopNotFoundDesc")
    : variant.value === "page"
      ? t("messages.error.pageNotFoundDesc")
      : t("messages.error.serverErrorDesc"),
);

const shopPickerOpen = ref(false);
/** 店铺清单：客户端懒加载（错误页内不做 SSR 取数，避免错误渲染期再触发异步副作用）。
 *  首帧为空，水合后填入；为空时 UI 自行降级，不阻塞错误页本身。 */
const { shops, load, goToShopHome } = useTenantSwitcher();
onMounted(() => {
  void load();
});
const recommended = computed(() => shops.value.slice(0, 3));
const switching = ref(false);
const switchError = ref("");

async function pick(code: string) {
  if (switching.value) return;
  switching.value = true;
  switchError.value = "";
  const ok = await goToShopHome(code);
  switching.value = false;
  if (!ok) switchError.value = t("messages.error.switchFailed");
}

function backHome() {
  return clearError({ redirect: goHome("/") });
}
</script>

<template>
  <UApp>
    <div class="flex min-h-svh flex-col">
      <AppHeader />
      <main class="flex flex-1 items-center justify-center px-4 py-10">
        <div v-if="variant !== 'page'" class="w-full max-w-md text-center">
          <p class="text-4xl font-bold text-primary">{{ statusCode }}</p>
          <h1 class="mt-3 text-xl font-semibold">{{ title }}</h1>
          <p class="mt-2 text-sm text-muted">{{ description }}</p>
          <div class="mt-8 flex flex-col gap-3">
            <UButton block size="lg" :label="t('messages.error.backHome')" @click="backHome" />
            <UButton
              block
              size="lg"
              color="neutral"
              variant="outline"
              :label="t('messages.error.chooseShop')"
              @click="shopPickerOpen = true"
            />
          </div>
        </div>

        <div v-else class="w-full max-w-md">
          <p class="text-4xl font-bold text-primary">{{ statusCode }}</p>
          <h1 class="mt-3 text-xl font-semibold">{{ title }}</h1>
          <p class="mt-2 text-sm text-muted">{{ description }}</p>
          <p v-if="recommended.length" class="mt-6 text-xs text-muted">
            {{ t("messages.error.maybeLike") }}
          </p>
          <div v-if="recommended.length" class="mt-2 flex flex-wrap gap-2">
            <UButton
              v-for="shop in recommended"
              :key="shop.code"
              size="sm"
              color="neutral"
              variant="soft"
              :label="shop.name"
              :loading="switching"
              @click="pick(shop.code)"
            />
          </div>
          <div class="mt-8">
            <UButton block size="lg" :label="t('messages.error.backHome')" @click="backHome" />
          </div>
        </div>
      </main>
      <AppFooter />
    </div>

    <UModal v-model:open="shopPickerOpen" :title="t('messages.error.chooseShop')">
      <template #body>
        <ul class="max-h-80 space-y-1 overflow-y-auto">
          <li v-for="shop in shops" :key="shop.code">
            <UButton
              block
              color="neutral"
              variant="ghost"
              class="justify-start"
              :label="shop.name"
              :loading="switching"
              @click="pick(shop.code)"
            >
              <template #trailing>
                <UBadge v-if="shop.isDefault" size="sm" variant="soft">
                  {{ t("messages.nav.officialShop") }}
                </UBadge>
              </template>
            </UButton>
          </li>
        </ul>
        <p v-if="!shops.length" class="py-6 text-center text-xs text-muted">
          {{ t("messages.error.switchFailed") }}
        </p>
        <p v-else-if="switchError" class="pt-2 text-center text-xs text-error">
          {{ switchError }}
        </p>
      </template>
    </UModal>
  </UApp>
</template>
