export interface ReorderLine {
  productVariantId: string;
  quantity: number;
}

export function useOrderActions() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const toast = useToast();
  const { t } = useI18n();
  const localePath = useTenantLocalePath();
  const { copy } = useClipboard();
  const { i18NBaseUrl } = useRuntimeConfig().public;

  const canCancel = (state: string) =>
    state === "AddingItems" || state === "ArrangingPayment";

  async function cancelOrder(order: { id: string; state: string }): Promise<boolean> {
    if (!canCancel(order.state)) {
      toast.add({ title: t("messages.order.cancelNotAllowed"), color: "warning" });
      return false;
    }
    loading.value = true;
    error.value = null;
    try {
      // 按单取消（cjk-plugin cancelMyOrder：本人 + 未支付状态守卫 + 释放库存）。
      // 原生 transitionOrderToState 无 orderId 参数，恒作用 active order，
      // 取消历史订单会误取消当前购物车（安全审计 P1-b）。
      const result = (await GqlCancelMyOrder({ orderId: order.id })).cancelMyOrder;
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
    try {
      // 并行加购 + 全量 settle：任一行失败（如变体已下架）不中断其余行，
      // 已成功的行保留在购物车（无快照回滚，后端无该能力），最后汇总 n/m 防止
      // 用户误以为全部成功而重复点击。
      const results = await Promise.allSettled(
        lines.map(async (line) => {
          const { addItemToOrder: res } = await GqlAddItemToOrder({
            variantId: line.productVariantId,
            quantity: line.quantity,
          });
          if (!(res && res.__typename !== undefined && res.__typename.startsWith("Order"))) {
            throw new Error(
              (res as { message?: string } | null)?.message ?? "add item failed",
            );
          }
          return res;
        }),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - ok;
      if (failed > 0) {
        const first = results.find((r) => r.status === "rejected") as
          | PromiseRejectedResult
          | undefined;
        const reason =
          first?.reason instanceof Error ? first.reason.message : String(first?.reason ?? "");
        error.value = reason || "reorder failed";
        toast.add({
          title: t("messages.order.reorderFailed"),
          description: `${ok}/${results.length}`,
          color: "error",
        });
        return false;
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