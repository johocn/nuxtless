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
});
