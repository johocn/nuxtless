import { describe, expect, it } from "vitest";
import { parseLoginResponse } from "../useGqlSession";

describe("parseLoginResponse", () => {
  it("成功登录时原样返回 data.login", () => {
    const login = { __typename: "CurrentUser", id: "1", identifier: "a@b.cn" };
    expect(parseLoginResponse({ data: { login } })).toEqual(login);
  });

  it("限流错误透传 code 与 retryAfterSeconds", () => {
    expect(
      parseLoginResponse({
        errors: [
          {
            message: "登录尝试过于频繁，请 15 分钟后再试",
            extensions: { code: "LOGIN_RATE_LIMITED", retryAfterSeconds: 900 },
          },
        ],
      }),
    ).toEqual({
      errorCode: "LOGIN_RATE_LIMITED",
      message: "登录尝试过于频繁，请 15 分钟后再试",
      retryAfterSeconds: 900,
    });
  });

  it("凭据错误透传 errorCode，且不伪造 retryAfterSeconds", () => {
    const result = parseLoginResponse({
      errors: [{ message: "invalid", extensions: { code: "INVALID_CREDENTIALS_ERROR" } }],
    });
    expect(result).toEqual({ errorCode: "INVALID_CREDENTIALS_ERROR", message: "invalid" });
    expect(result && "retryAfterSeconds" in result).toBe(false);
  });

  it("无 data 也无 errors 时返回 null", () => {
    expect(parseLoginResponse({})).toBeNull();
  });

  it("retryAfterSeconds 非数字时忽略", () => {
    const result = parseLoginResponse({
      errors: [{ message: "x", extensions: { code: "LOGIN_RATE_LIMITED", retryAfterSeconds: "900" as unknown as number } }],
    });
    expect(result).toEqual({ errorCode: "LOGIN_RATE_LIMITED", message: "x" });
  });
});
