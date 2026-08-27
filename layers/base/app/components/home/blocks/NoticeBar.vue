<script setup lang="ts">
const props = defineProps<{
  text?: string;
  block?: { data?: { content?: string; items?: Array<{ text?: string }> } };
}>();
// 优先直传 text（积木 nav 区块）；回退支持既有 block 契约
// 后端 Notice 契约是 { content: string }；兼容旧式 items 数组
const text = computed(() => {
  if (props.text) return props.text;
  const d = props.block?.data ?? {};
  if (d.content) return d.content;
  return (d.items ?? []).map((i) => i.text ?? "").join("；");
});
</script>
<template>
  <div
    v-if="text"
    class="overflow-hidden border-b border-gray-100 bg-neutral-50 py-2"
    aria-label="公告栏"
  >
    <div class="mx-auto flex max-w-5xl items-center gap-2 px-4 text-sm text-neutral-600">
      <span class="mr-1 shrink-0 font-medium text-primary">公告</span>
      <span>{{ text }}</span>
    </div>
  </div>
</template>