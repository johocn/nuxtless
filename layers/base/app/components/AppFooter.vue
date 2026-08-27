<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import type { MenuCollections } from "~~/types/collection";
import { assetSrc } from "../utils/image";

const route = useRoute();
const { t } = useI18n();
const localePath = useLocalePath();

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
      };
    }) ?? [],
);
</script>

<template>
  <!-- 移动端整块隐藏（仅 PC 显示），移动端"为你推荐"下方只保留 JdTabBar 的四 tab（首页/分类/购物车/我的） -->
  <UFooter class="hidden lg:block">
    <template #top>
      <USeparator />
    </template>

    <template #left>
      <LogoElement wrapper-class="w-1/2" class="hidden md:block" />
    </template>

    <UNavigationMenu :items="items" variant="link" class="hidden md:block" />

    <template #bottom>
      <div class="flex justify-center">
        <p class="opacity-80">{{ t("messages.general.footer.unstack") }}</p>
      </div>
    </template>
  </UFooter>
</template>

<style lang="css" scoped></style>
