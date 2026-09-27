import { describe, expect, it } from "vitest";
import {
  detailLayout,
  blockVisible,
  parseDetailConfig,
  localizeText,
  parseHotelRoomConfig,
  productHasHotelRoom,
  resolveDetailLayout,
} from "../detail-config";

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

  it("parseHotelRoomConfig：JSON 字符串 / 对象 / 坏值", () => {
    expect(parseHotelRoomConfig('{"rooms":[]}')).toEqual({ rooms: [] });
    expect(parseHotelRoomConfig({ rooms: [] })).toEqual({ rooms: [] }); // 已是对象则透传
    expect(parseHotelRoomConfig("not-json")).toBeNull(); // 坏 JSON → null
    expect(parseHotelRoomConfig('"str"')).toBeNull();    // 合法 JSON 但非对象 → null
    expect(parseHotelRoomConfig(null)).toBeNull();
    expect(parseHotelRoomConfig(undefined)).toBeNull();
    expect(parseHotelRoomConfig(123)).toBeNull();
  });

  it("productHasHotelRoom：任一变体命中即 true", () => {
    const room = { customFields: { hotelRoomConfig: '{"rooms":[]}' } };
    const plain = { customFields: { hotelRoomConfig: null } };
    expect(productHasHotelRoom([plain, room])).toBe(true);
    expect(productHasHotelRoom([plain])).toBe(false);
    expect(productHasHotelRoom([{ customFields: { hotelRoomConfig: "not-json" } }])).toBe(false);
    expect(productHasHotelRoom([])).toBe(false);
    expect(productHasHotelRoom(null)).toBe(false);
    expect(productHasHotelRoom(undefined)).toBe(false);
  });

  // 判据语义（设计 §3.5）：无房型 / classic+房型 / 显式非 hotel(floor|dualBuy|mall)+房型 / hotel+房型
  it("resolveDetailLayout：classic/缺省 + 房型自动命中 hotel", () => {
    const room = [{ customFields: { hotelRoomConfig: '{"rooms":[]}' } }];
    const noRoom = [{ customFields: { hotelRoomConfig: null } }];
    // 无房型 → 按配置（默认 classic）
    expect(resolveDetailLayout({ version: 1, layout: "classic" }, noRoom)).toBe("classic");
    expect(resolveDetailLayout({ version: 1 }, noRoom)).toBe("classic");
    expect(resolveDetailLayout(null, null)).toBe("classic");
    // classic + 房型 → 自动命中 hotel（classic 不算显式覆盖）
    expect(resolveDetailLayout({ version: 1, layout: "classic" }, room)).toBe("hotel");
    expect(resolveDetailLayout(null, room)).toBe("hotel");
    // 显式非 hotel 版式 + 房型 → 以配置为准
    expect(resolveDetailLayout({ version: 1, layout: "floor" }, room)).toBe("floor");
    expect(resolveDetailLayout({ version: 1, layout: "dualBuy" }, room)).toBe("dualBuy");
    expect(resolveDetailLayout({ version: 1, layout: "mall" }, room)).toBe("mall");
    // 显式 hotel（无房型）→ 仍返回 hotel，由 DetailHotel 内部 isHotel 为 false 回退经典
    expect(resolveDetailLayout({ version: 1, layout: "hotel" }, noRoom)).toBe("hotel");
  });
});