import { describe, expect, it } from "vitest";
import {
  composeProductTitle,
  isAutoSku,
  resolveSkuLabel,
} from "../product-title";

describe("isAutoSku", () => {
  it("P+时间戳 判定为自动编码", () => {
    expect(isAutoSku("p1788780326947")).toBe(true);
    expect(isAutoSku("P1788780326947")).toBe(true);
  });
  it("真实 SKU 非自动编码", () => {
    expect(isAutoSku("SPU-2024-001")).toBe(false);
    expect(isAutoSku("")).toBe(false);
    expect(isAutoSku(null)).toBe(false);
  });
});

describe("composeProductTitle", () => {
  it("无规格（单 SKU）隐藏变体名，即使变体名是自动编码", () => {
    expect(composeProductTitle("国信南山温泉节假日房间", "p1788780326947", false)).toBe(
      "国信南山温泉节假日房间",
    );
  });
  it("无规格且变体名等于商品名时只显示商品名", () => {
    expect(composeProductTitle("智能手环", "智能手环", false)).toBe("智能手环");
  });
  it("多规格显示「商品名 规格组合」", () => {
    expect(composeProductTitle("智能手环", "经典黑", true)).toBe("智能手环 经典黑");
  });
  it("多规格但变体名等于商品名时不重复", () => {
    expect(composeProductTitle("智能手环", "智能手环", true)).toBe("智能手环");
  });
});

describe("resolveSkuLabel", () => {
  it("真实 SKU 原样返回", () => {
    expect(resolveSkuLabel("SPU-2024-001", "经典黑", true)).toEqual({
      type: "sku",
      text: "SPU-2024-001",
    });
  });
  it("自动编码 + 无规格 → 规格：默认（text 空串）", () => {
    expect(resolveSkuLabel("p1788780326947", "p1788780326947", false)).toEqual({
      type: "spec",
      text: "",
    });
  });
  it("自动编码 + 多规格 → 规格：变体名", () => {
    expect(resolveSkuLabel("p1788780326947", "经典黑", true)).toEqual({
      type: "spec",
      text: "经典黑",
    });
  });
  it("无 SKU 返回 null", () => {
    expect(resolveSkuLabel(null, "经典黑", true)).toBeNull();
  });
});
