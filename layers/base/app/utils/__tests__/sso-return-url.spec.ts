import { describe, expect, it } from "vitest";
import { resolveSsoReturnUrl, shouldSkipAutoLogin, toRouterSafePath } from "../sso-return-url";

const ORIGIN = "https://www.youshop.cn";

describe("toRouterSafePath", () => {
  it("同源完整 URL 归一化为路径（线上 bug 场景）", () => {
    expect(toRouterSafePath("https://www.youshop.cn/", ORIGIN)).toBe("/");
    expect(toRouterSafePath("https://www.youshop.cn/account", ORIGIN)).toBe("/account");
  });
  it("保留 query 与 hash", () => {
    expect(toRouterSafePath("https://www.youshop.cn/t2/product/x?invite=ABC#detail", ORIGIN)).toBe(
      "/t2/product/x?invite=ABC#detail",
    );
  });
  it("相对路径原样返回（已是路由安全形态）", () => {
    expect(toRouterSafePath("/account?invite=1", ORIGIN)).toBe("/account?invite=1");
    expect(toRouterSafePath("/", ORIGIN)).toBe("/");
  });
  it("跨域返回 null（开放重定向防护）", () => {
    expect(toRouterSafePath("https://evil.com/path", ORIGIN)).toBeNull();
  });
  it("非法字符串返回 null", () => {
    expect(toRouterSafePath("http://", ORIGIN)).toBeNull();
  });
});

describe("resolveSsoReturnUrl", () => {
  it("sessionStorage 同源完整 URL 归一化后返回", () => {
    expect(resolveSsoReturnUrl("https://www.youshop.cn/", null, ORIGIN)).toBe("/");
  });
  it("sessionStorage 优先于 query", () => {
    expect(resolveSsoReturnUrl("/a?x=1", "/b", ORIGIN)).toBe("/a?x=1");
  });
  it("sessionStorage 为空或跨域时回退 query（query 也归一化）", () => {
    expect(resolveSsoReturnUrl(null, "https://www.youshop.cn/t2/product/x?invite=1", ORIGIN)).toBe(
      "/t2/product/x?invite=1",
    );
    expect(resolveSsoReturnUrl("https://evil.com/", "/safe", ORIGIN)).toBe("/safe");
  });
  it("两者都无效返回空串（回调页走 /account 缺省）", () => {
    expect(resolveSsoReturnUrl(null, null, ORIGIN)).toBe("");
    expect(resolveSsoReturnUrl("https://evil.com/", "https://evil.too/", ORIGIN)).toBe("");
  });
});

describe("shouldSkipAutoLogin", () => {
  it("登录/注册/回调页跳过（含租户前缀与 login 别名）", () => {
    expect(shouldSkipAutoLogin("/account/login")).toBe(true);
    expect(shouldSkipAutoLogin("/t2/account/login")).toBe(true);
    expect(shouldSkipAutoLogin("/login")).toBe(true);
    expect(shouldSkipAutoLogin("/t2/login")).toBe(true);
    expect(shouldSkipAutoLogin("/account/register")).toBe(true);
    expect(shouldSkipAutoLogin("/t2/account/register")).toBe(true);
    expect(shouldSkipAutoLogin("/account/sso-callback")).toBe(true);
    expect(shouldSkipAutoLogin("/t2/account/sso-callback")).toBe(true);
  });
  it("普通页面不跳过", () => {
    expect(shouldSkipAutoLogin("/")).toBe(false);
    expect(shouldSkipAutoLogin("/product/x")).toBe(false);
    expect(shouldSkipAutoLogin("/t2/product/x")).toBe(false);
    expect(shouldSkipAutoLogin("/account")).toBe(false);
    expect(shouldSkipAutoLogin("/account/orders")).toBe(false);
  });
});
