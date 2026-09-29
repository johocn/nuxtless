import { describe, expect, it } from "vitest";
import {
  AFTER_SALES_TABS,
  AFTER_SALES_ACTIVE_STATES,
  afterSalesNextStep,
  afterSalesPrimaryAction,
  afterSalesProgressIndex,
  afterSalesStateInfo,
  afterSalesTypeLabelKey,
  canApplyAfterSales,
  canCancelAfterSales,
  canFillTracking,
  tabOfAfterSales,
} from "../after-sales-state";

describe("after-sales-state", () => {
  it("5 个页签，默认第一个是「进行中」", () => {
    expect(AFTER_SALES_TABS.map((t) => t.key)).toEqual([
      "ACTIVE",
      "ALL",
      "DONE",
      "REJECTED",
      "CLOSED",
    ]);
  });

  it("进行中收纳 Pending/Approved/Returning/Received/RefundFailed", () => {
    for (const s of ["Pending", "Approved", "Returning", "Received", "RefundFailed"]) {
      expect(AFTER_SALES_ACTIVE_STATES.has(s)).toBe(true);
      expect(tabOfAfterSales(s)).toBe("ACTIVE");
    }
    expect(tabOfAfterSales("Refunded")).toBe("DONE");
    expect(tabOfAfterSales("Rejected")).toBe("REJECTED");
    expect(tabOfAfterSales("Closed")).toBe("CLOSED");
    expect(tabOfAfterSales("WhoKnows")).toBe("ALL");
  });

  it("RefundFailed 有独立文案与 error 色（不再落到 stateUnknown）", () => {
    const info = afterSalesStateInfo("RefundFailed");
    expect(info.labelKey).toBe("messages.afterSales.stateRefundFailed");
    expect(info.color).toBe("error");
  });

  it("进度索引覆盖 8 态", () => {
    expect(afterSalesProgressIndex("Pending")).toBe(0);
    expect(afterSalesProgressIndex("Approved")).toBe(1);
    expect(afterSalesProgressIndex("Returning")).toBe(2);
    expect(afterSalesProgressIndex("Received")).toBe(3);
    expect(afterSalesProgressIndex("Refunded")).toBe(4);
    expect(afterSalesProgressIndex("RefundFailed")).toBe(3);
    expect(afterSalesProgressIndex("Rejected")).toBe(0);
    expect(afterSalesProgressIndex("Closed")).toBe(0);
  });

  it("每个状态都有引导文案", () => {
    for (const s of [
      "Pending",
      "Approved",
      "Returning",
      "Received",
      "Refunded",
      "Rejected",
      "RefundFailed",
      "Closed",
      "WhoKnows",
    ]) {
      expect(afterSalesNextStep(s).titleKey.startsWith("messages.afterSales.next")).toBe(true);
      expect(afterSalesNextStep(s).descKey.startsWith("messages.afterSales.next")).toBe(true);
    }
  });

  it("动作可用性严格对齐服务端：取消仅 Pending，填单仅 Approved", () => {
    expect(canCancelAfterSales("Pending")).toBe(true);
    expect(canCancelAfterSales("Approved")).toBe(false);
    expect(canFillTracking("Approved")).toBe(true);
    expect(canFillTracking("Returning")).toBe(false);
  });

  it("卡片主行动映射", () => {
    expect(afterSalesPrimaryAction("Pending")).toBe("cancel");
    expect(afterSalesPrimaryAction("Approved")).toBe("tracking");
    expect(afterSalesPrimaryAction("Returning")).toBe("service");
    expect(afterSalesPrimaryAction("Received")).toBe("service");
    expect(afterSalesPrimaryAction("RefundFailed")).toBe("service");
    expect(afterSalesPrimaryAction("Refunded")).toBe("detail");
    expect(afterSalesPrimaryAction("Rejected")).toBe("detail");
    expect(afterSalesPrimaryAction("Closed")).toBe("none");
  });

  it("申请入口白名单与类型标签", () => {
    expect(canApplyAfterSales("Shipped")).toBe(true);
    expect(canApplyAfterSales("Cancelled")).toBe(true);
    expect(canApplyAfterSales("PaymentSettled")).toBe(false);
    expect(afterSalesTypeLabelKey("exchange")).toBe("messages.afterSales.typeExchange");
    expect(afterSalesTypeLabelKey("nope")).toBe("messages.afterSales.typeUnknown");
  });
});
