import { describe, expect, it } from "vitest";
import {
  orderDetailLayout, orderListLayout, orderDetailBlockVisible,
  parseOrderDetailConfig, parseOrderListConfig, localizeOrderText,
} from "../order-config";

describe("order-config", () => {
  it("坏 JSON / 空 → null", () => {
    expect(parseOrderDetailConfig("not-json")).toBeNull();
    expect(parseOrderDetailConfig("{bad")).toBeNull();
    expect(parseOrderDetailConfig(null)).toBeNull();
    expect(parseOrderDetailConfig("42")).toBeNull();
    expect(parseOrderListConfig("not-json")).toBeNull();
  });

  it("缺省 layout 回退 jd（默认京东版式）", () => {
    expect(orderDetailLayout(null)).toBe("jd");
    expect(orderDetailLayout({ version: 1 })).toBe("jd");
    expect(orderDetailLayout({ version: 1, layout: "bogus" as any })).toBe("jd");
  });

  it("classic 透传", () => {
    expect(orderDetailLayout({ version: 1, layout: "classic" })).toBe("classic");
  });

  it("列表版式本期恒 card", () => {
    expect(orderListLayout(null)).toBe("card");
    expect(orderListLayout({ version: 1, layout: "card" })).toBe("card");
  });

  it("块显隐逐级兜底：定制→内建→true", () => {
    const cfg = { version: 1, blocks: { items: { visible: false } } };
    expect(orderDetailBlockVisible(cfg, "items")).toBe(false);
    expect(orderDetailBlockVisible(cfg, "status")).toBe(true);
    expect(orderDetailBlockVisible(null, "actions")).toBe(true);
    expect(orderDetailBlockVisible(null, "unknown_key")).toBe(true);
  });

  it("localizeOrderText 逐级回退", () => {
    const obj = { "zh-CN": "中文", "en-US": "English" };
    expect(localizeOrderText(obj, "en-US")).toBe("English");
    expect(localizeOrderText(obj, "de-DE")).toBe("中文");
    expect(localizeOrderText("共用", "de-DE")).toBe("共用");
    expect(localizeOrderText(null, "de-DE")).toBe("");
    expect(localizeOrderText({ "en-US": "Only EN" }, "fr-FR")).toBe("Only EN");
  });
});