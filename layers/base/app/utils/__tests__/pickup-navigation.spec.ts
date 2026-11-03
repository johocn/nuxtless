import { describe, expect, it } from "vitest";
import { buildNavigationUri, hasCoords } from "../pickup-navigation";

describe("buildNavigationUri", () => {
    it("有坐标 → 高德导航 URI，终点为经度,纬度,名称", () => {
        const uri = buildNavigationUri({
            name: "杭州湖滨店",
            coordinates: "30.25,120.16",
        });
        expect(uri).toBe(
            `https://uri.amap.com/navigation?to=120.16,30.25,${encodeURIComponent("杭州湖滨店")}` +
                `&mode=car&src=nshop&coordinate=gaode&callnative=1`,
        );
    });

    it("对象坐标同样可用", () => {
        const uri = buildNavigationUri({
            name: "A",
            coordinates: { lat: 30.1, lng: 120.2 },
        });
        expect(uri).toContain("to=120.2,30.1,A");
    });

    it("无坐标但有地址 → 回退按地址搜索", () => {
        const address = "吉林省长春市自由大路 123 号";
        const uri = buildNavigationUri({ name: "自由大路店", coordinates: null, address });
        expect(uri).toBe(
            `https://uri.amap.com/search?keyword=${encodeURIComponent(address)}` +
                `&src=nshop&coordinate=gaode&callnative=1`,
        );
    });

    it("坐标非法时同样回退地址搜索", () => {
        const uri = buildNavigationUri({ name: "x", coordinates: "bad", address: "某路 1 号" });
        expect(uri?.startsWith("https://uri.amap.com/search?keyword=")).toBe(true);
    });

    it("坐标与地址都缺失 → null（调用方禁用导航入口）", () => {
        expect(buildNavigationUri({ name: "x", coordinates: "bad" })).toBeNull();
        expect(buildNavigationUri({ name: "x", coordinates: null, address: "  " })).toBeNull();
        expect(buildNavigationUri(null)).toBeNull();
    });
});

describe("hasCoords", () => {
    it("有坐标 true，仅地址 false", () => {
        expect(hasCoords({ name: "A", coordinates: "30.1,120.2" })).toBe(true);
        expect(hasCoords({ name: "A", coordinates: null, address: "某路" })).toBe(false);
        expect(hasCoords(null)).toBe(false);
    });
});
