<script setup lang="ts">
// 品牌闪购区块适配：复用京东兜底楼层组件（数据自 useMenuCollections 写入的 useState('menuCollections')）
import JdBrandFloor from "../jd/JdBrandFloor.vue";
import { localizeText } from "../../../utils/detail-config";
import type { BrandFloorSection } from "../../../utils/shop-content";

const props = defineProps<{ section: BrandFloorSection }>();
const { locale } = useI18n();

// 标题 LocalizedText 回退链；未配置时传 undefined，由 JdBrandFloor 回退 i18n 文案
const title = computed(() => localizeText(props.section?.title, locale.value) || undefined);
</script>

<template>
  <JdBrandFloor :title="title" />
</template>