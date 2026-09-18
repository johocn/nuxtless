export function useChannelTheme() {
  const config = useState<string>("channel-theme", () => "default");
  const customFields = useState<Record<string, any> | null>(
    "channel-theme-customfields",
    () => null,
  );

  async function loadTheme() {
    try {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      const cf = res.data.value?.activeChannel?.customFields ?? null;
      customFields.value = cf;
      config.value = cf?.themeId ?? "default";
    } catch {
      config.value = "default";
    }
    return config.value;
  }

  function applyTheme() {
    if (import.meta.server) return;
    document.documentElement.setAttribute("data-theme", config.value);
  }

  return { config, customFields, loadTheme, applyTheme };
}