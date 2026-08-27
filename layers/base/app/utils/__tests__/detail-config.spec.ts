import { describe, expect, it } from "vitest";
import { detailLayout, blockVisible, parseDetailConfig, localizeText } from "../detail-config";

describe("detail-config", () => {
  it("坏 JSON 返回 null，layout 回退 classic", () => {
    expect(parseDetailConfig("not-json")).toBeNull();
    expect(detailLayout(parseDetailConfig("not-json"))).toBe("classic");
  });

  it("缺省 layout 回退 classic", () => {
    expect(detailLayout({ version: 1 })).toBe("classic");
  });

  it("floor / dualBuy 生效", () => {
    expect(detailLayout({ version: 1, layout: "floor" })).toBe("floor");
    expect(detailLayout({ version: 1, layout: "dualBuy" })).toBe("dualBuy");
  });

  it("块显隐逐级兜底", () => {
    const cfg = { version: 1, blocks: { gallery: { visible: false } } };
    expect(blockVisible(cfg, "gallery")).toBe(false);
    expect(blockVisible(cfg, "price")).toBe(true); // 未配置 → 内建默认
    expect(blockVisible(null, "nearby")).toBe(true); // null → 全局默认
    expect(blockVisible(null, "unknown_key")).toBe(true); // 未知 key → 全局默认
  });

  it("localizeText 逐级回退", () => {
    const obj = { "zh-CN": "中文", "en-US": "English" };
    expect(localizeText(obj, "en-US")).toBe("English"); // 当前 locale 命中
    expect(localizeText(obj, "de-DE")).toBe("中文");     // 缺失 → fallback defaultLocale
    expect(localizeText("共用", "de-DE")).toBe("共用");   // 字符串 = 各语言共用
    expect(localizeText(null, "de-DE")).toBe("");         // 缺省 → 空
    expect(localizeText({ "en-US": "Only EN" }, "fr-FR")).toBe("Only EN"); // 首值兜底
  });
});