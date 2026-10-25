<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import type { MenuCollections } from "~~/types/collection";
import { assetSrc } from "../utils/image";

const { logoTop } = useAppConfig();
const route = useRoute();
const localePath = useTenantLocalePath();

// 店铺品牌：渠道装修字段优先（多租户店招不同），未配置回退全局 logo。
// useThemeConfig 的 useAsyncData key 固定，与 app.vue 复用同一份 GetChannelTheme 数据。
const { channelCfs } = useThemeConfig();
const brandLogo = computed(
  () => (channelCfs.value?.shopLogo as string | undefined) || logoTop.light,
);
const brandName = computed(
  () => (channelCfs.value?.shopName as string | undefined) || "Home",
);

const menuCollections = useState<MenuCollections>("menuCollections");
// 券店模式：头部精简（无分类导航/搜索/购物车），保留 Logo、城市/租户选择器、AccountMenu
const { isCouponStore } = useStorefrontMode();

const items = computed<NavigationMenuItem[]>(
  () =>
    menuCollections.value?.collections.items.map((collection) => {
      const parentPath = localePath(`/category/${collection.slug}`);
      const isActive =
        route.path.startsWith(parentPath) ||
        collection.children?.some((child) =>
          route.path.startsWith(localePath(`/category/${child.slug}`)),
        );

      return {
        label: collection.name,
        to: parentPath,
        avatar: { src: assetSrc(collection.featuredAsset?.preview, 48) },
        defaultOpen: isActive,
        active: isActive,
        children: collection.children?.map((child) => ({
          label: child.name,
          to: localePath(`/category/${child.slug}`),
        })),
      };
    }) ?? [],
);
</script>

<template>
  <UHeader
    toggle-side="left"
    class="sticky top-0"
    :ui="{ toggle: 'h-[36px]! w-[36px]! min-w-0! p-0! justify-center [&>span]:size-[20px]!' }"
  >
    <template #left>
      <ULink
        :to="localePath('/')"
        class="transition-opacity hover:opacity-80"
        :aria-label="brandName"
      >
        <LogoElement
          :logo-light="brandLogo"
          :logo-dark="brandLogo"
          :alt="brandName"
          wrapper-class="w-[104px] shrink-0 h-[40px] md:w-[136px] md:h-[52px]"
        />
      </ULink>
    </template>

    <UNavigationMenu
      v-if="!isCouponStore"
      :items="items"
      variant="link"
      content-orientation="vertical"
    />

    <template #right>
      <!-- 移动端隐藏：抽屉 #body 里已有一份租户选择器（见下方），页头再放一份会把右侧组撑到
           338px 超出 390px 视口（横向可滚 + 购物车角标被切），并把品牌 logo 压成 32px 细缝。
           城市选择器保留——它决定配送/库存，是多城市店的主操作。 -->
      <div class="hidden items-center sm:flex">
        <HeaderTenantSelector />
      </div>
      <HeaderCitySelector />
      <SearchModal v-if="!isCouponStore" />
      <AccountMenu />
      <CartTrigger v-if="!isCouponStore" />
    </template>

    <template #body>
      <UNavigationMenu
        v-if="!isCouponStore"
        :items="items"
        variant="pill"
        orientation="vertical"
        :ui="{ item: 'py-1', childItem: 'pt-2' }"
      />
      <div class="mt-2 border-t border-default pt-2">
        <HeaderTenantSelector />
      </div>
    </template>
  </UHeader>
  <CartPanel v-if="!isCouponStore" />
</template>
