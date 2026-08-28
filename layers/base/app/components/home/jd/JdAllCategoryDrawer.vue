<script setup lang="ts">
// JD 风格「全部分类」抽屉（移动端）：TabBar「分类」与功能宫格「全部分类」共用触发
// 数据来源：顶部分类(collection)（GetMenuCollections 已加载到 menuCollections 状态，未动底层）
// 通过全局 state isAllCatOpen 控制显隐，任何页面/组件都可 set true 打开。
import type { MenuCollections } from "~~/types/collection";
import { assetSrc } from "../../../utils/image";

const { t } = useI18n();
const localePath = useLocalePath();
const open = useState<boolean>("isAllCatOpen", () => false);

const menuCollections = useState<MenuCollections>("menuCollections");
const cats = computed(() => menuCollections.value?.collections?.items ?? []);

function linkFor(slug: string) {
  return slug ? localePath(`/category/${slug}`) : localePath("/");
}
function close() {
  open.value = false;
}
</script>

<template>
  <!-- 遮罩 -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[70] bg-black/40 lg:hidden"
        @click="close"
      />
    </Transition>

    <!-- 抽屉 -->
    <Transition name="slide">
      <aside
        v-if="open"
        role="dialog"
        aria-modal="true"
        :aria-label="t('messages.nav.allCategories')"
        class="fixed inset-y-0 left-0 z-[71] flex w-[82%] max-w-sm flex-col bg-white lg:hidden"
      >
        <header class="flex items-center justify-between bg-primary px-4 py-3 text-white">
          <span class="text-base font-semibold">{{ t('messages.nav.allCategories') }}</span>
          <button
            type="button"
            :aria-label="t('messages.shop.close')"
            class="rounded p-1 hover:bg-white/15"
            @click="close"
          >
            <UIcon name="i-lucide-x" class="h-5 w-5" />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto">
          <template v-for="cat in cats" :key="cat.slug + cat.name">
            <NuxtLink
              :to="linkFor(cat.slug)"
              class="group flex items-center gap-2 border-b border-gray-100 px-4 py-3"
              @click="close"
            >
              <NuxtImg
                v-if="cat.featuredAsset?.preview"
                :src="assetSrc(cat.featuredAsset.preview, 72)"
                class="h-9 w-9 shrink-0 rounded object-cover"
              />
              <span class="h-9 w-9 shrink-0 rounded bg-gray-100" v-else />
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-gray-800">{{ cat.name }}</span>
                <span v-if="cat.children?.length" class="mt-0.5 block truncate text-xs text-gray-400">
                  {{ cat.children.map((c) => c.name).join(" · ") }}
                </span>
              </span>
            </NuxtLink>
          </template>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}
</style>