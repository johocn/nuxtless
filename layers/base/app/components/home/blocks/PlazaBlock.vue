<script setup lang="ts">
// 品质专区区块适配：分类数据自 useState('menuCollections')；无分类则整层隐藏（与现状一致）
import type { MenuCollections } from "~~/types/collection";
import JdPlazaGrid from "../jd/JdPlazaGrid.vue";
import { localizeText } from "../../../utils/detail-config";
import type { PlazaSection } from "../../../utils/shop-content";

const props = defineProps<{ section: PlazaSection }>();
const { locale } = useI18n();

const menuCollections = useState<MenuCollections>("menuCollections");
const categories = computed(() => menuCollections.value?.collections?.items ?? []);
const title = computed(() => localizeText(props.section?.title, locale.value) || undefined);
</script>

<template>
  <div v-if="categories.length" class="mt-2">
    <JdPlazaGrid :categories="categories" :title="title" />
  </div>
</template>