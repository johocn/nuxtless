export function useChannelTheme() {
  const config = useState<string>("channel-theme", () => "default");

  async function loadTheme() {
    try {
      const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
      const id =
        res.data.value?.activeChannel?.customFields?.themeId ?? "default";
      config.value = id;
    } catch {
      config.value = "default";
    }
    return config.value;
  }

  function applyTheme() {
    if (import.meta.server) return;
    document.documentElement.setAttribute("data-theme", config.value);
  }

  return { config, loadTheme, applyTheme };
}