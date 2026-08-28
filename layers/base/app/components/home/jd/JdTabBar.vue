<script setup lang="ts">
// JD 风格移动端底部固定导航（首页/分类/购物车/我的）
// 全部复用 nshop 既有能力，未动底层：
//   - 首页 → /
//   - 分类 → 全部分类抽屉(isAllCatOpen)，与功能宫格共用
//   - 购物车 → 全局 CartPanel 弹层(isCartOpen)
//   - 我的 → /account
// 仅移动端显示(lg:hidden)，PC 端保留原顶部导航。
const route = useRoute();
const localePath = useLocalePath();
const { t } = useI18n();

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
    class="fixed inset-x-0 bottom-0 z-[60] grid grid-cols-4 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] text-xs lg:hidden"
    :aria-label="t('messages.nav.bottomNav')"
  >
    <NuxtLink
      :to="localePath('/')"
      class="flex flex-col items-center gap-0.5 py-2"
      :class="active === 'home' ? 'text-primary' : 'text-gray-500'"
    >
      <UIcon
        :name="active === 'home' ? 'i-lucide-home' : 'i-lucide-home'"
        class="h-6 w-6"
      />
      <span>{{ t('messages.nav.home') }}</span>
    </NuxtLink>

    <button
      type="button"
      class="flex flex-col items-center gap-0.5 py-2 text-gray-500"
      @click="isAllCatOpen = true"
    >
      <UIcon name="i-lucide-layout-grid" class="h-6 w-6" />
      <span>{{ t('messages.nav.categories') }}</span>
    </button>

    <button
      type="button"
      class="relative flex flex-col items-center gap-0.5 py-2 text-gray-500"
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
      class="flex flex-col items-center gap-0.5 py-2"
      :class="active === 'account' ? 'text-primary' : 'text-gray-500'"
    >
      <UIcon name="i-lucide-user" class="h-6 w-6" />
      <span>{{ t('messages.nav.my') }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped></style>