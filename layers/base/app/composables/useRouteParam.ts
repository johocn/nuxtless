// 类型安全的 route param/query 取值，替代散落的 `route.params.xxx as string` 断言。
// 兼容 vue-router 5 的 `string | string[] | null` 值类型。
export function useRouteParam(name: string): string {
  const route = useRoute();
  const value = route.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function useRouteQuery(name: string): string {
  const route = useRoute();
  const value = route.query[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
