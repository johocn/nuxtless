import { describe, it, expect } from "vitest";
import {
  saleProgress,
  saleCardProgress,
  formatCouponDiscount,
  couponSavingsExample,
  couponAnchorYuan,
  couponSceneArt,
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

describe("saleCardProgress", () => {
  it("claimable=false 且不限量：付费出售不视为售罄（P0：忽略 claimable）", () => {
    expect(saleCardProgress({ claimedCount: 5, totalCount: 0 })).toEqual({
      percent: null,
      soldOut: false,
    });
    expect(saleCardProgress({ claimedCount: 5, totalCount: undefined })).toEqual({
      percent: null,
      soldOut: false,
    });
  });
  it("限量券：已抢满即售罄", () => {
    expect(saleCardProgress({ claimedCount: 100, totalCount: 100 })).toEqual({
      percent: 100,
      soldOut: true,
    });
    expect(saleCardProgress({ claimedCount: 120, totalCount: 100 }).soldOut).toBe(true);
  });
  it("限量未抢满：进度口径同 saleProgress", () => {
    expect(saleCardProgress({ claimedCount: 82, totalCount: 100 })).toEqual({
      percent: 82,
      soldOut: false,
    });
  });
  it("脏数据不抛错", () => {
    expect(saleCardProgress({})).toEqual({ percent: null, soldOut: false });
  });
});

describe("formatCouponDiscount", () => {
  it("PERCENT：80→8 折，85→8.5 折", () => {
    expect(formatCouponDiscount({ type: "PERCENT", discountValue: 80 })).toEqual({
      kind: "percent",
      percent: 8,
    });
    expect(formatCouponDiscount({ type: "PERCENT", discountValue: 85 })).toEqual({
      kind: "percent",
      percent: 8.5,
    });
  });
  it("FIXED/FULL：金额分→元字符串", () => {
    expect(formatCouponDiscount({ type: "FIXED", discountValue: 500 })).toEqual({
      kind: "fixed",
      amount: "5",
    });
    expect(formatCouponDiscount({ type: "FULL", discountValue: 505 })).toEqual({
      kind: "full",
      amount: "5.05",
    });
  });
  it("缺字段不抛错", () => {
    expect(formatCouponDiscount({})).toEqual({ kind: "fixed", amount: "0" });
  });
});

describe("couponSavingsExample", () => {
  it("8 折：消费 100 省 20 余 80", () => {
    expect(couponSavingsExample({ type: "PERCENT", discountValue: 80 })).toEqual({
      spend: 100,
      save: 20,
      after: 80,
    });
  });
  it("8.5 折：消费 100 省 15 余 85", () => {
    expect(couponSavingsExample({ type: "PERCENT", discountValue: 85 }, 100)).toEqual({
      spend: 100,
      save: 15,
      after: 85,
    });
  });
  it("非 PERCENT / 非法入参返回 null", () => {
    expect(couponSavingsExample({ type: "FIXED", discountValue: 500 })).toBeNull();
    expect(couponSavingsExample({ type: "PERCENT", discountValue: 0 })).toBeNull();
    expect(couponSavingsExample({ type: "PERCENT", discountValue: 80 }, 0)).toBeNull();
  });
});

describe("couponAnchorYuan", () => {
  it("anchorPrice 高于售价：分→元字符串", () => {
    expect(couponAnchorYuan({ anchorPrice: 3000, salePrice: 500 })).toBe("30");
  });
  it("anchorPrice 低于/等于售价：防误导不展示", () => {
    expect(couponAnchorYuan({ anchorPrice: 500, salePrice: 500 })).toBeNull();
    expect(couponAnchorYuan({ anchorPrice: 300, salePrice: 500 })).toBeNull();
  });
  it("未配置 / 脏数据返回 null", () => {
    expect(couponAnchorYuan({})).toBeNull();
    expect(couponAnchorYuan({ anchorPrice: null, salePrice: 500 })).toBeNull();
    expect(couponAnchorYuan({ anchorPrice: 0, salePrice: 500 })).toBeNull();
  });
});

describe("couponSceneArt", () => {
  it("关键词映射：台球/餐/饮", () => {
    expect(couponSceneArt("台球畅打2小时券")).toBe("billiards");
    expect(couponSceneArt("桌球八折券")).toBe("billiards");
    expect(couponSceneArt("西餐双人餐券")).toBe("dining");
    expect(couponSceneArt("快餐立减券")).toBe("dining");
    expect(couponSceneArt("拿铁咖啡券")).toBe("drink");
    expect(couponSceneArt("珍珠奶茶券")).toBe("drink");
  });
  it("默认 generic", () => {
    expect(couponSceneArt("全场买单券")).toBe("generic");
    expect(couponSceneArt("")).toBe("generic");
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
