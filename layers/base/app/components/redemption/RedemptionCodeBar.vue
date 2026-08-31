<template>
  <div class="redemption-code-bar">
    <svg ref="svgRef" class="redemption-code-bar__svg" data-testid="redeem-code-bar"></svg>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** 核销码 / 商品条码值（Code128） */
    value: string;
  }>(),
  {},
);

const svgRef = ref<SVGSVGElement | null>(null);

onMounted(async () => {
  if (!svgRef.value || !props.value) return;

  // jsbarcode 不兼容 SSR，需在客户端动态引入，渲染到 ref 的 <svg>
  const JsBarcode = (await import('jsbarcode')).default;

  try {
    JsBarcode(svgRef.value, props.value, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: true,
      font: 'monospace',
      textMargin: 4,
      margin: 8,
    });
  } catch (err) {
    // 无效的条码内容时保持空白，不抛错
    console.error('[RedemptionCodeBar] 生成 Code128 条码失败:', err);
  }
});
</script>

<style scoped>
.redemption-code-bar {
  display: flex;
  justify-content: center;
  width: 100%;
}

.redemption-code-bar__svg {
  max-width: 100%;
  height: auto;
}
</style>