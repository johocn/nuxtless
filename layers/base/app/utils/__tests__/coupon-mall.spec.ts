import { describe, it, expect } from "vitest";
import {
  saleProgress,
  hasDetail,
  parseDetailParagraphs,
  detailAssetUrl,
} from "../coupon-mall";

describe("saleProgress", () => {
  it("限量券：按已抢/总量算百分比", () => {
    expect(saleProgress({ claimedCount: 82, totalCount: 100, claimable: true })).toEqual({
      percent: 82,
      soldOut: false,
    });
  });
  it("百分比封顶 100，满格即售罄", () => {
    expect(saleProgress({ claimedCount: 120, totalCount: 100, claimable: true })).toEqual({
      percent: 100,
      soldOut: true,
    });
  });
  it("totalCount=0 不限量：无进度条，仅按 claimable 判售罄", () => {
    expect(saleProgress({ claimedCount: 5, totalCount: 0, claimable: true })).toEqual({
      percent: null,
      soldOut: false,
    });
    expect(saleProgress({ claimedCount: 5, totalCount: 0, claimable: false }).soldOut).toBe(true);
  });
  it("claimable=false 直接售罄", () => {
    expect(saleProgress({ claimedCount: 3, totalCount: 10, claimable: false }).soldOut).toBe(true);
  });
  it("字段缺失/脏数据不抛错", () => {
    expect(saleProgress({ claimedCount: undefined, totalCount: undefined, claimable: undefined })).toEqual({
      percent: null,
      soldOut: false,
    });
  });
});

describe("hasDetail", () => {
  it("description 有当前语言内容 → true", () => {
    expect(hasDetail({ "zh-CN": "介绍", "en-US": "intro" }, "zh-CN")).toBe(true);
  });
  it("空白内容 → false", () => {
    expect(hasDetail({ "zh-CN": "   " }, "zh-CN")).toBe(false);
  });
  it("空/缺字段 → false", () => {
    expect(hasDetail(null, "zh-CN")).toBe(false);
    expect(hasDetail({}, "zh-CN")).toBe(false);
  });
});

describe("parseDetailParagraphs", () => {
  it("文本行与整行图片标记分开渲染", () => {
    expect(
      parseDetailParagraphs("第一行\n![图](https://cdn.example.com/a.png)\n第二行"),
    ).toEqual([
      { type: "text", content: "第一行" },
      { type: "image", content: "https://cdn.example.com/a.png" },
      { type: "text", content: "第二行" },
    ]);
  });
  it("URL 为空的非法标记按普通文本回退", () => {
    expect(parseDetailParagraphs("![图]()")).toEqual([{ type: "text", content: "![图]()" }]);
  });
  it("空串返回空数组", () => {
    expect(parseDetailParagraphs("")).toEqual([]);
  });
});

describe("detailAssetUrl", () => {
  it("http(s) 开头原样返回", () => {
    expect(detailAssetUrl("https://a.com/x.png", "https://shop.com")).toBe("https://a.com/x.png");
  });
  it("相对路径拼当前 origin", () => {
    expect(detailAssetUrl("/media/x.png", "https://shop.com")).toBe("https://shop.com/media/x.png");
  });
});
