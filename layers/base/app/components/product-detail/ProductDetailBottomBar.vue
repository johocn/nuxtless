<script setup lang="ts">
// 详情页统一吸底操作栏（一栏合并式，移动端常驻 / PC 仅双按钮）
// 左：首页/分类/购物车/我的 导航图标（复用全局 JdTabBar 的状态与入口，保持一致）
// 右：加入购物车 + 立即购买 双按钮（复用 useBuyActions 购买逻辑）
// 三版式（classic/floor/dualBuy）统一由 ProductDetailRenderer 挂载，消除各自 fixed/sticky 底栏与全局 TabBar 重叠。
import { useProductDetailView } from "../../composables/useProductDetailView";
import { useBuyActions } from "../../composables/useBuyActions";

const { t } = useI18n();
const localePath = useTenantLocalePath();
const route = useRoute();
const { productServiceable } = useProductDetailView();
const { canBuy, loading, addToCartHandler, buyNowHandler } = useBuyActions();

// 导航状态（与 home/jd/JdTabBar 一致，保证打开/关闭行为统一）
const isCartOpen = useState<boolean>("isCartOpen", () => false);
const isAllCatOpen = useState<boolean>("isAllCatOpen", () => false);
const { order } = storeToRefs(useOrderStore());
const cartCount = computed(
  () => order.value?.lines?.reduce((sum, l) => sum + l.quantity, 0) ?? 0,
);
const active = computed(() => {
  if (route.path === "/") return "home";
  if (route.path.startsWith("/account")) return "account";
  return "home";
});
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-100 bg-white/95 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden"
    aria-label="商品详情底部操作栏"
  >
    <!-- 移动端：一栏合并式（导航图标 + 双按钮） -->
    <div class="flex items-center">
      <div class="grid grid-cols-4 border-r border-gray-100 text-xs">
        <NuxtLink
          :to="localePath('/')"
          class="flex flex-col items-center gap-0.5 px-2 py-2.5"
          :class="active === 'home' ? 'text-primary' : 'text-gray-500'"
        >
          <UIcon :name="active === 'home' ? 'i-lucide-home' : 'i-lucide-home'" class="h-6 w-6" />
          <span>{{ t('messages.nav.home') }}</span>
        </NuxtLink>

        <button
          type="button"
          class="flex flex-col items-center gap-0.5 px-2 py-2.5 text-gray-500"
          @click="isAllCatOpen = true"
        >
          <UIcon name="i-lucide-layout-grid" class="h-6 w-6" />
          <span>{{ t('messages.nav.categories') }}</span>
        </button>

        <button
          type="button"
          class="relative flex flex-col items-center gap-0.5 px-2 py-2.5 text-gray-500"
          @click="isCartOpen = true"
        >
          <span class="relative">
            <UIcon name="i-lucide-shopping-cart" class="h-6 w-6" />
            <span
              v-if="cartCount > 0"
              class="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white"
            >
              {{ cartCount }}
            </span>
          </span>
          <span>{{ t('messages.nav.cart') }}</span>
        </button>

        <NuxtLink
          :to="localePath('/account')"
          class="flex flex-col items-center gap-0.5 px-2 py-2.5"
          :class="active === 'account' ? 'text-primary' : 'text-gray-500'"
        >
          <UIcon name="i-lucide-user" class="h-6 w-6" />
          <span>{{ t('messages.nav.my') }}</span>
        </NuxtLink>
      </div>

      <div class="flex flex-1 items-center gap-2 px-3 py-2.5">
        <UButton
          class="flex-1 justify-center"
          color="secondary"
          size="lg"
          icon="i-lucide-shopping-cart"
          :loading="loading"
          :disabled="!productServiceable || !canBuy"
          @click="addToCartHandler"
        >{{ t("messages.detail.addToCart") }}</UButton>
        <UButton
          class="flex-1 justify-center"
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