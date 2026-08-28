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

// 中国表单：单一「收货人」字段必填；省/市/区/街道四级下拉；地址2必填；
// 联系电话必填；邮箱选填。字段语义沿用 Vendure 标准地址字段。
export const AddressForm = object({
  fullName: pipe(string(), nonEmpty("Recipient name is required")),
  emailAddress: optional(pipe(string(), email("Invalid email"))),
  streetLine1: pipe(string(), nonEmpty("Address is required")),
  streetLine2: pipe(string(), nonEmpty("Address 2 is required")),
  province: optional(string()),
  city: pipe(string(), nonEmpty("City is required")),
  district: optional(string()),
  street: optional(string()),
  postalCode: optional(string()),
  countryCode: pipe(string(), nonEmpty("Country is required")),
  phoneNumber: pipe(string(), nonEmpty("Phone number is required")),
  isDefault: boolean(),
  billingSameAsShipping: boolean(),
});

export type AddressForm = InferOutput<typeof AddressForm>;
