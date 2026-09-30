<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import type { MenuCollections } from "~~/types/collection";
import { assetSrc } from "../utils/image";

const { logoTop } = useAppConfig();
const route = useRoute();
const localePath = useTenantLocalePath();

const menuCollections = useState<MenuCollections>("menuCollections");

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
  <UHeader toggle-side="left" class="sticky top-0">
    <template #left>
      <ULink
        :to="localePath('/')"
        class="transition-opacity hover:opacity-80"
        aria-label="Home"
      >
        <LogoElement
          :logo-light="logoTop.light"
          :logo-dark="logoTop.dark"
          wrapper-class="w-full h-[40px] md:h-[50px]"
        />
      </ULink>
    </template>

    <UNavigationMenu
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
      <SearchModal />
      <AccountMenu />
      <CartTrigger />
    </template>

    <template #body>
      <UNavigationMenu
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
  <CartPanel />
</template>
