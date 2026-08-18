import type { AfterSalesType } from "#gql/default";

export interface CreateAfterSalesInput {
  orderId: string;
  orderLineId?: string | null;
  type?: string;
  reason: string;
  description?: string | null;
  refundAmount: number;
}

export interface AfterSalesResult {
  ok: boolean;
  id?: string | null;
  message?: string | null;
}

export function useAfterSales() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const toast = useToast();
  const { t } = useI18n();

  async function createRequest(input: CreateAfterSalesInput): Promise<AfterSalesResult> {
    loading.value = true;
    error.value = null;
    try {
      const { createAfterSalesRequest } = await GqlCreateAfterSalesRequest({
        input: {
          orderId: input.orderId,
          orderLineId: input.orderLineId ?? undefined,
          type: (input.type ?? "return_refund") as AfterSalesType,
          reason: input.reason,
          description: input.description ?? null,
          refundAmount: input.refundAmount,
        },
      });
      toast.add({ title: t("afterSales.createSuccess"), color: "success" });
      return { ok: true, id: createAfterSalesRequest?.id };
    } catch (e: any) {
      const msg = e?.message ?? "create after-sales failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  async function cancelRequest(id: string): Promise<AfterSalesResult> {
    loading.value = true;
    error.value = null;
    try {
      await GqlCancelAfterSalesRequest({ id });
      toast.add({ title: t("afterSales.cancelSuccess"), color: "success" });
      return { ok: true, id };
    } catch (e: any) {
      const msg = e?.message ?? "cancel after-sales failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  async function updateTracking(id: string, trackingNo: string, carrier: string): Promise<AfterSalesResult> {
    loading.value = true;
    error.value = null;
    try {
      await GqlUpdateReturnTracking({ id, trackingNo, carrier });
      toast.add({ title: t("afterSales.trackingSuccess"), color: "success" });
      return { ok: true, id };
    } catch (e: any) {
      const msg = e?.message ?? "update tracking failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, createRequest, cancelRequest, updateTracking };
}