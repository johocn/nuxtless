import { useAsyncData } from "#imports";

export function useHomeContent() {
  const { data: content, status, error } = useAsyncData(
    "home-content",
    async () => {
      const res = await useAsyncGql("GetHomeContent", { position: "home" });
      // useAsyncGql 返回 { data: Ref<GetHomeContentQuery> }，与 category/[slug].vue 的 `collectionProducts.value?.search` 约定一致
      return res.data.value?.publishedContent ?? [];
    },
    { server: true },
  );
  return { content, status, error };
}