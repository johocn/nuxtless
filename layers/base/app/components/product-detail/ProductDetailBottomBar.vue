<script setup lang="ts">
// 详情页统一吸底操作栏：返回 + 首页(宽屏≥375px) + 加入购物车/立即购买 双按钮
// 三版式（classic/floor/dualBuy）统一由 ProductDetailRenderer 挂载，消除各自 fixed/sticky 底栏与全局 TabBar 重叠。
import { useProductDetailView } from "../../composables/useProductDetailView";
import { useBuyActions } from "../../composables/useBuyActions";

const { t } = useI18n();
const localePath = useTenantLocalePath();
const route = useRoute();
const router = useRouter();
const { productServiceable } = useProductDetailView();
const { canBuy, loading, addToCartHandler, buyNowHandler } = useBuyActions();

function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push(localePath("/"));
  }
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-100 bg-white/95 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden"
    aria-label="商品详情底部操作栏"
  >
    <div class="flex items-center">
      <div class="flex items-center border-r border-gray-100 text-xs">
        <button
          type="button"
          class="flex flex-col items-center gap-0.5 px-2 py-2.5 text-gray-500"
          @click="goBack"
        >
          <UIcon name="i-lucide-arrow-left" class="h-6 w-6" />
          <span>{{ t('messages.nav.back') }}</span>
        </button>
        <NuxtLink
          :to="localePath('/')"
          class="hidden flex-col items-center gap-0.5 px-2 py-2.5 min-[375px]:flex"
          :class="route.path === '/' ? 'text-primary' : 'text-gray-500'"
        >
          <UIcon name="i-lucide-home" class="h-6 w-6" />
          <span>{{ t('messages.nav.home') }}</span>
        </NuxtLink>
      </div>

      <div class="flex flex-1 items-center gap-2 px-3 py-2.5">
        <UButton
          class="flex-1 justify-center whitespace-nowrap"
          color="secondary"
          size="lg"
          icon="i-lucide-shopping-cart"
          :loading="loading"
          :disabled="!productServiceable || !canBuy"
          @click="addToCartHandler"
        >{{ t("messages.detail.addToCart") }}</UButton>
        <UButton
          class="flex-1 justify-center whitespace-nowrap"
          color="primary"
          size="lg"
          icon="i-lucide-zap"
          :loading="loading"
          :disabled="!productServiceable || !canBuy"
          @click="buyNowHandler"
        >{{ t("messages.detail.buyNow") }}</UButton>
      </div>
    </div>
  </nav>
</template>

<style scoped></style>
