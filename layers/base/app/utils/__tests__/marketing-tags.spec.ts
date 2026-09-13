import { describe, expect, it } from "vitest";
import { resolveMarketingTagTexts } from "../marketing-tags";

const dict = {
  "flash-sale": "限时秒杀",
  "price-drop": "降价",
  limited: "限量",
};

describe("resolveMarketingTagTexts", () => {
  it("code 命中 i18n 字典返回文案", () => {
    expect(resolveMarketingTagTexts(["flash-sale"], dict)).toEqual(["限时秒杀"]);
  });

  it("未知 code 按原文兜底", () => {
    expect(resolveMarketingTagTexts(["new-arrival"], dict)).toEqual(["new-arrival"]);
  });

  it("空数组返回空数组", () => {
    expect(resolveMarketingTagTexts([], dict)).toEqual([]);
  });

  it("过滤空文案", () => {
    expect(resolveMarketingTagTexts(["", "flash-sale"], dict)).toEqual(["限时秒杀"]);
  });

  it("Vendure text 字段返回 JSON 字符串时解析为数组", () => {
    expect(resolveMarketingTagTexts('["flash-sale","price-drop"]', dict)).toEqual([
      "限时秒杀",
      "降价",
    ]);
  });

  it("JSON 字符串为空数组或 null 返回空数组", () => {
    expect(resolveMarketingTagTexts("[]", dict)).toEqual([]);
    expect(resolveMarketingTagTexts(null, dict)).toEqual([]);
    expect(resolveMarketingTagTexts(undefined, dict)).toEqual([]);
  });

  it("非法 JSON 字符串按单个原文兜底", () => {
    expect(resolveMarketingTagTexts("秒杀", dict)).toEqual(["秒杀"]);
  });
});
