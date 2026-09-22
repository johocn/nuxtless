import { describe, expect, it } from "vitest";
import { selectPrimaryProvider, shouldShowOverlay } from "../sso-provider";

describe("selectPrimaryProvider", () => {
  it("预取命中优先于实时", () => {
    const prefetched = [{ protocol: "zhao-sso", providerKey: "p1" }];
    const live = [{ protocol: "zhao-sso", providerKey: "p2" }];
    const r = selectPrimaryProvider(prefetched, live);
    expect(r.source).toBe("prefetched");
    expect(r.provider?.providerKey).toBe("p1");
  });
  it("预取为空则回退实时", () => {
    const r = selectPrimaryProvider([], [{ protocol: "zhao-sso", providerKey: "p2" }]);
    expect(r.source).toBe("live");
    expect(r.provider?.providerKey).toBe("p2");
  });
  it("两者为空返回 none", () => {
    const r = selectPrimaryProvider(null, []);
    expect(r.source).toBe("none");
    expect(r.provider).toBeNull();
  });
});

describe("shouldShowOverlay", () => {
  it("pending+未登录+微信 → true", () => {
    expect(shouldShowOverlay({ pending: true, authenticated: false, isWechat: true })).toBe(true);
  });
  it("已登录或非微信 → false", () => {
    expect(shouldShowOverlay({ pending: true, authenticated: true, isWechat: true })).toBe(false);
    expect(shouldShowOverlay({ pending: true, authenticated: false, isWechat: false })).toBe(false);
    expect(shouldShowOverlay({ pending: false, authenticated: false, isWechat: true })).toBe(false);
  });
});