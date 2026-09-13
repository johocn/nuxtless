import "photoswipe/style.css";
import { resolveMarketingTagTexts } from "../utils/marketing-tags";

export function useProductLightbox({
  select,
}: {
  select: (i: number) => void;
}) {
  const { product, selectedVariant, galleryAssets } =
    storeToRefs(useProductStore());
  const { tm } = useI18n();

  async function createDataSource() {
    const altBase =
      selectedVariant.value?.name || product.value?.name || "Product image";
    const tags = resolveMarketingTagTexts(
      product.value?.customFields?.marketingTags ?? [],
      (tm("messages.detail.marketingTags") ?? {}) as Record<string, string>,
    ).join(" ");

    const assets = galleryAssets.value;

    const promises = assets.map(async (item, idx) => {
      const img = new window.Image();
      img.src = item.preview;
      await new Promise((resolve) => {
        if (img.complete) return resolve(null);
        img.onload = resolve;
        img.onerror = resolve;
      });

      return {
        src: item.preview,
        width: img.naturalWidth,
        height: img.naturalHeight,
        alt: `${tags ? `${tags} ` : ""}${altBase} – Slide ${idx + 1}`,
      };
    });

    return Promise.all(promises);
  }

  const openPhotoSwipe = async (startIndex = 0) => {
    const PhotoSwipe = (await import("photoswipe")).default;
    const dataSource = await createDataSource();

    const pswp = new PhotoSwipe({
      dataSource,
      index: startIndex,
      showHideAnimationType: "none",
    });

    pswp.on("close", () => {
      select(pswp.currIndex);
    });

    pswp.init();
  };

  return { openPhotoSwipe };
}
