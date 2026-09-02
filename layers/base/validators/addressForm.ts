import {
  object,
  pipe,
  string,
  email,
  boolean,
  optional,
  nonEmpty,
} from "valibot";
import type { InferOutput } from "valibot";

// 中国表单：单一「收货人」字段必填；省/市/区/街道四级下拉；邮编物流必填；
// 公司/地址2/邮箱选填；联系电话必填。字段语义沿用 Vendure 标准地址字段。
// 校验提示通过 t() 本地化（中文/英文随 locale 切换）。
export function createBillingAddressSchema(t: (key: string) => string) {
  return object({
    fullName: pipe(string(), nonEmpty(t("messages.billing.requiredFullName"))),
    company: optional(string()),
    emailAddress: optional(
      pipe(string(), email(t("messages.billing.invalidEmail"))),
    ),
    streetLine1: pipe(string(), nonEmpty(t("messages.billing.requiredAddress"))),
    streetLine2: optional(string()),
    province: optional(string()),
    city: pipe(string(), nonEmpty(t("messages.billing.requiredCity"))),
    district: optional(string()),
    street: optional(string()),
    // 物流必填（自提无地址，不涉及本 schema）
    postalCode: pipe(
      string(),
      nonEmpty(t("messages.billing.requiredPostalCode")),
    ),
    countryCode: pipe(string(), nonEmpty(t("messages.billing.requiredCountry"))),
    phoneNumber: pipe(string(), nonEmpty(t("messages.billing.requiredPhone"))),
    isDefault: boolean(),
    billingSameAsShipping: boolean(),
  });
}

export type AddressForm = InferOutput<
  ReturnType<typeof createBillingAddressSchema>
>;
