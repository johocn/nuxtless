export interface ReorderLine {
  productVariantId: string;
  quantity: number;
}

export function useOrderActions() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const toast = useToast();
  const { t } = useI18n();
  const localePath = useLocalePath();
  const { copy } = useClipboard();
  const { i18NBaseUrl } = useRuntimeConfig().public;

  const canCancel = (state: string) =>
    state === "AddingItems" || state === "ArrangingPayment";

  async function cancelOrder(state: string): Promise<boolean> {
    if (!canCancel(state)) {
      toast.add({ title: t("messages.order.cancelNotAllowed"), color: "warning" });
      return false;
    }
    loading.value = true;
    error.value = null;
    try {
      const result = (
        await GqlTransitionToState({
          state: "Cancelled",
        })
      ).transitionOrderToState;
      const ok = result?.__typename === "Order";
      if (ok) {
        toast.add({ title: t("messages.order.cancelSuccess"), color: "success" });
        return true;
      }
      error.value =
        (result as { message?: string } | null)?.message ?? null;
      toast.add({ title: error.value ?? t("messages.order.cancelFailed"), color: "error" });
      return false;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "cancel failed";
      toast.add({ title: t("messages.order.cancelFailed"), color: "error" });
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function reorder(lines: ReorderLine[]): Promise<boolean> {
    loading.value = true;
    error.value = null;
    let ok = 0;
    try {
      for (const line of lines) {
        const { addItemToOrder: res } = await GqlAddItemToOrder({
          variantId: line.productVariantId,
          quantity: line.quantity,
        });
        if (
          res &&
          res.__typename !== undefined &&
          res.__typename.startsWith("Order")
        ) {
          ok += 1;
        }
      }
      if (ok > 0) {
        toast.add({ title: t("messages.order.reorderSuccess"), color: "success" });
      }
      return ok > 0;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "reorder failed";
      toast.add({ title: t("messages.order.reorderFailed"), color: "error" });
      return false;
    } finally {
      loading.value = false;
    }
  }

  function copyOrderLink(code: string) {
    const path = localePath(`/order/${code}`);
    copy(`${i18NBaseUrl}${path}`);
    toast.add({
      title: t("messages.general.getLinkSuccess"),
      color: "success",
    });
  }

  return { loading, error, canCancel, cancelOrder, reorder, copyOrderLink };
}