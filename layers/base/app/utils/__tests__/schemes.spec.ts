import { describe, expect, it } from "vitest";
import {
  parseSchemeList,
  localizeSchemeText,
  resolveSchemeText,
  resolveSchemeTexts,
} from "../schemes";

describe("schemes", () => {
  const schemes = [
    { code: "freeShip99", text: { zh_Hans: "满99元包邮", en: "Free ship over 99" } },
    { code: "refund7", text: { zh_Hans: "支持7天无理由退换", en: "7-day return" } },
  ];

  it("坏 JSON / 非数组 → null", () => {
    expect(parseSchemeList("not-json")).toBeNull();
    expect(parseSchemeList("{}")).toBeNull();
    expect(parseSchemeList(null)).toBeNull();
  });

  it("合法 JSON 数组 → 过滤非法项", () => {
    const r = parseSchemeList(JSON.stringify([{ code: "a", text: { zh_Hans: "A" } }, { no: "code" }]));
    expect(r?.length).toBe(1);
  });

  it("localizeSchemeText 前端 locale → Vendure 语言码映射", () => {
    const text = { zh_Hans: "满99元包邮", en: "Free ship over 99" };
    expect(localizeSchemeText(text, "zh-CN")).toBe("满99元包邮");
    expect(localizeSchemeText(text, "en-US")).toBe("Free ship over 99");
    expect(localizeSchemeText(text, "de-DE")).toBe("满99元包邮"); // 缺失 → defaultLocale
  });

  it("resolveSchemeText 命中/未命中", () => {
    expect(resolveSchemeText(schemes, "refund7", "zh-CN")).toBe("支持7天无理由退换");
    expect(resolveSchemeText(schemes, "unknown", "zh-CN")).toBe("");
  });

  it("商品覆盖：按 codes 过滤；未配置（空）→ 频道默认全部", () => {
    expect(resolveSchemeTexts(schemes, ["refund7"], "zh-CN")).toEqual(["支持7天无理由退换"]);
    expect(resolveSchemeTexts(schemes, ["nope", "refund7"], "zh-CN")).toEqual(["支持7天无理由退换"]);
    expect(resolveSchemeTexts(schemes, [], "zh-CN")).toEqual(["满99元包邮", "支持7天无理由退换"]);
    expect(resolveSchemeTexts(null, [], "zh-CN")).toEqual([]);
  });
});
