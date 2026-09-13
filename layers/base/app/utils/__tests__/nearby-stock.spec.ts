import { describe, expect, it } from "vitest";
import { formatNearbyDistance, serviceCityLabel } from "../nearby-stock";

describe("formatNearbyDistance", () => {
  it("null 显示距离未知", () => {
    expect(formatNearbyDistance(null)).toBe("距离未知");
  });
  it("超大值（后端无坐标返回 MAX_SAFE_INTEGER）显示距离未知", () => {
    expect(formatNearbyDistance(Number.MAX_SAFE_INTEGER)).toBe("距离未知");
    expect(formatNearbyDistance(1e10)).toBe("距离未知");
  });
  it("小于 1km 显示米", () => {
    expect(formatNearbyDistance(0.45)).toBe("450m");
  });
  it("大于等于 1km 显示一位小数 km", () => {
    expect(formatNearbyDistance(2.33)).toBe("2.3km");
  });
});

describe("serviceCityLabel", () => {
  it("有城市 join 顿号", () => {
    expect(serviceCityLabel(["长春市", "沈阳市"])).toBe("长春市、沈阳市");
  });
  it("空数组显示全城", () => {
    expect(serviceCityLabel([])).toBe("全城");
  });
  it("undefined 显示全城", () => {
    expect(serviceCityLabel(undefined)).toBe("全城");
  });
});
