/**
 * 租户店面模式（Channel.customFields.storefrontMode）：
 * normal=普通商城（默认）；coupon=券店（整店只卖买单券）。
 * 值由 app.vue 的 loadTheme 在 SSR 期间写入共享 state，此处纯解析（坏值回退默认）。
 */
export function useStorefrontMode() {
  const { customFields } = useChannelTheme();

  const mode = computed<"normal" | "coupon">(() =>
    customFields.value?.storefrontMode === "coupon" ? "coupon" : "normal",
  );
  const homeLayout = computed<"floors" | "grid">(() =>
    customFields.value?.storefrontHomeLayout === "grid" ? "grid" : "floors",
  );
  const isCouponStore = computed(() => mode.value === "coupon");

  return { mode, homeLayout, isCouponStore };
}
