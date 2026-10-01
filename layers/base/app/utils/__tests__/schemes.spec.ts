import { describe, expect, it } from "vitest";
import {
  parseSchemeList,
  localizeSchemeText,
  resolveSchemeText,
  resolveSchemeTexts,
  toVendureLanguageCode,
  VENDURE_LOCALE_MAP,
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

  it("Vendure text 字段返回 JSON 字符串时兼容解析", () => {
    expect(resolveSchemeTexts(schemes, '["refund7"]', "zh-CN")).toEqual(["支持7天无理由退换"]);
    expect(resolveSchemeTexts(schemes, "[]", "zh-CN")).toEqual(["满99元包邮", "支持7天无理由退换"]);
    expect(resolveSchemeTexts(schemes, null, "zh-CN")).toEqual(["满99元包邮", "支持7天无理由退换"]);
    expect(resolveSchemeTexts(null, '["refund7"]', "zh-CN")).toEqual([]);
  });
});

describe("toVendureLanguageCode", () => {
  it("12 种语言全部映射到 Vendure LanguageCode", () => {
    expect(Object.keys(VENDURE_LOCALE_MAP).length).toBe(12);
    expect(toVendureLanguageCode("zh-CN")).toBe("zh_Hans");
    expect(toVendureLanguageCode("en-US")).toBe("en");
    expect(toVendureLanguageCode("de-DE")).toBe("de");
    expect(toVendureLanguageCode("es-ES")).toBe("es");
    expect(toVendureLanguageCode("fr-FR")).toBe("fr");
    expect(toVendureLanguageCode("it-IT")).toBe("it");
    expect(toVendureLanguageCode("pt-BR")).toBe("pt");
    expect(toVendureLanguageCode("ja-JP")).toBe("ja");
    expect(toVendureLanguageCode("ko-KR")).toBe("ko");
    expect(toVendureLanguageCode("ru-RU")).toBe("ru");
    expect(toVendureLanguageCode("bg-BG")).toBe("bg");
    expect(toVendureLanguageCode("fa-IR")).toBe("fa");
  });

  it("未知 / 空 locale 回退默认语言码，不透传", () => {
    expect(toVendureLanguageCode("xx-YY")).toBe("zh_Hans");
    expect(toVendureLanguageCode(null)).toBe("zh_Hans");
    expect(toVendureLanguageCode(undefined)).toBe("zh_Hans");
  });

  it("fallback 参数可覆盖（默认语言为 en 时）", () => {
    expect(toVendureLanguageCode("de-DE", "en")).toBe("de");
    expect(toVendureLanguageCode("xx-YY", "en")).toBe("en");
    expect(toVendureLanguageCode(null, "en")).toBe("en");
  });

  it("localizeSchemeText 支持德语命中", () => {
    const text = { zh_Hans: "满99元包邮", en: "Free ship over 99", de: "Kostenloser Versand" };
    expect(localizeSchemeText(text, "de-DE")).toBe("Kostenloser Versand");
    expect(localizeSchemeText(text, "ja-JP")).toBe("满99元包邮"); // 未录 → defaultLocale
  });
});
