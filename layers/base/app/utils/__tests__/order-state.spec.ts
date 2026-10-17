import { describe, expect, it } from "vitest";
import { isOrderVisible, tabOfState } from "../order-state";

describe("isOrderVisible（订单列表可见性过滤）", () => {
  it("取消单放行：Vendure cancelOrder 会清零行数量，qty=0 是取消单常态", () => {
    expect(
      isOrderVisible({ state: "Cancelled", type: "Regular", totalQuantity: 0 }),
    ).toBe(true);
  });

  it("未取消的幽灵单（0 件空购物车）拦截", () => {
    expect(
      isOrderVisible({ state: "AddingItems", type: "Regular", totalQuantity: 0 }),
    ).toBe(false);
    expect(
      isOrderVisible({ state: "ArrangingPayment", type: "Regular", totalQuantity: 0 }),
    ).toBe(false);
  });

  it("正常订单放行（Regular / Aggregate）", () => {
    expect(
      isOrderVisible({ state: "PaymentSettled", type: "Regular", totalQuantity: 1 }),
    ).toBe(true);
    expect(
      isOrderVisible({ state: "Delivered", type: "Aggregate", totalQuantity: 2 }),
    ).toBe(true);
  });

  it("商户子单（Seller）拦截，含取消态", () => {
    expect(
      isOrderVisible({ state: "PaymentSettled", type: "Seller", totalQuantity: 1 }),
    ).toBe(false);
    expect(
      isOrderVisible({ state: "Cancelled", type: "Seller", totalQuantity: 0 }),
    ).toBe(false);
  });

  it("totalQuantity 缺失按 0 处理（未取消则拦截）", () => {
    expect(isOrderVisible({ state: "AddingItems" })).toBe(false);
  });
});

describe("取消单页签归位", () => {
  it("Cancelled 归入 CANCELLED 页签", () => {
    expect(tabOfState("Cancelled")).toBe("CANCELLED");
  });
});
