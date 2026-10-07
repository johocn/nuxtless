import type { AfterSalesType } from "#gql/default";

export interface CreateAfterSalesInput {
  orderId: string;
  orderLineId?: string | null;
  type?: string;
  reason: string;
  description?: string | null;
  evidenceImages?: string[] | null;
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
          evidenceImages: input.evidenceImages && input.evidenceImages.length ? input.evidenceImages : null,
          refundAmount: input.refundAmount,
        },
      });
      toast.add({ title: t("messages.afterSales.createSuccess"), color: "success" });
      return { ok: true, id: createAfterSalesRequest?.id };
    } catch (e: any) {
      const msg = e?.gqlErrors?.[0]?.message ?? e?.message ?? "create after-sales failed";
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
      toast.add({ title: t("messages.afterSales.cancelSuccess"), color: "success" });
      return { ok: true, id };
    } catch (e: any) {
      const msg = e?.gqlErrors?.[0]?.message ?? e?.message ?? "cancel after-sales failed";
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
      toast.add({ title: t("messages.afterSales.trackingSuccess"), color: "success" });
      return { ok: true, id };
    } catch (e: any) {
      const msg = e?.gqlErrors?.[0]?.message ?? e?.message ?? "update tracking failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  /** 上传单张凭证图（data URL → 服务端 asset），返回绝对 URL；失败返回 null */
  async function uploadEvidence(dataUrl: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const { uploadAfterSalesEvidence } = await GqlUploadAfterSalesEvidence({ images: [dataUrl] });
      return uploadAfterSalesEvidence?.[0] ?? null;
    } catch (e: any) {
      if (signal?.aborted) return null;
      const msg = e?.gqlErrors?.[0]?.message ?? e?.message ?? "upload evidence failed";
      error.value = msg;
      return null;
    }
  }

  /** 读当前店铺售后寄回地址（未配置返回空串） */
  async function fetchReturnAddress(): Promise<string> {
    try {
      const res = await GqlAfterSalesReturnAddress();
      return res?.afterSalesReturnAddress ?? "";
    } catch {
      return "";
    }
  }

  /** 售后单协商留言（createdAt 正序；skip/take 分页，默认 take=50 上限 100） */
  async function fetchMessages(id: string, skip?: number, take?: number) {
    const res = await GqlAfterSalesMessages({ id, options: { skip: skip ?? undefined, take: take ?? undefined } });
    return res?.afterSalesMessages ?? { items: [], totalItems: 0 };
  }

  /** 顾客追加协商留言（Closed 后服务端拒绝；图片 ≤3、正文 ≤1000 由服务端校验） */
  async function addMessage(id: string, content: string, images?: string[]): Promise<AfterSalesResult> {
    loading.value = true;
    error.value = null;
    try {
      await GqlAddAfterSalesMessage({ id, content, images: images && images.length ? images : undefined });
      return { ok: true, id };
    } catch (e: any) {
      const msg = e?.gqlErrors?.[0]?.message ?? e?.message ?? "add message failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  /** 顾客确认收到换货商品（ExchangeShipped → Closed） */
  async function exchangeReceive(id: string): Promise<AfterSalesResult> {
    loading.value = true;
    error.value = null;
    try {
      await GqlExchangeReceiveAfterSalesRequest({ id });
      toast.add({ title: t("messages.afterSales.exchangeReceiveSuccess"), color: "success" });
      return { ok: true, id };
    } catch (e: any) {
      const msg = e?.gqlErrors?.[0]?.message ?? e?.message ?? "exchange receive failed";
      error.value = msg;
      toast.add({ title: msg, color: "error" });
      return { ok: false, message: msg };
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, createRequest, cancelRequest, updateTracking, uploadEvidence, fetchReturnAddress, fetchMessages, addMessage, exchangeReceive };
}