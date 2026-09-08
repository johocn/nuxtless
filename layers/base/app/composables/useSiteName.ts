/**
 * 站点名：租户域名（URL 首段命中租户 code）时回退为租户展示名（tenant-channels.json 的 name，
 * 即后端的 Channel.customFields.shopName），否则用默认 i18n 站点名（messages.site.title）。
 * 覆盖 default.vue 的浏览器标题/SEO、app.vue 与商品/分类页的 schema.org 品牌。
 */
export function useSiteName() {
  const { t } = useI18n();
  const { current } = useTenantChannel();
  const siteName = computed<string>(() => {
    if (current.value?.name) return current.value.name;
    return t("messages.site.title");
  });
  return siteName;
}