import { object, pipe, string, nonEmpty, optional, record } from "valibot";
import type { InferOutput } from "valibot";

export const PaymentForm = object({
  code: pipe(string(), nonEmpty("Please select a payment method")),
  // 分箱支付：boxKey -> 该箱所选支付方式 code（可为空对象，合并态不使用）
  boxPay: optional(record(string(), string()), {}),
});

export type PaymentForm = InferOutput<typeof PaymentForm>;
