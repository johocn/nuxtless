/** 租户感知的 localePath：给目标路径补上当前租户前缀，再交给 i18n 的 localePath。
 *  默认中文 => /t2/product/x；英文 => /en/t2/product/x。目标已含租户前缀则去重。 */
export function useTenantLocalePath() {
  const { code } = useTenantChannel();
  const localePath = useLocalePath();

  return (to: string): string => {
    const path = to.startsWith("/") ? to : `/${to}`;
    const tc = code.value ? `/${code.value}` : "";
    if (tc && (path === tc || path.startsWith(`${tc}/`))) return localePath(path);
    return localePath(tc + path);
  };
}