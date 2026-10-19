import { check, minLength, object, pipe, string } from "valibot";
import type { InferOutput } from "valibot";

/**
 * 登录标识符：邮箱或中国大陆手机号均可。
 * 手机号注册用户（phone-auth-plugin）的 User.identifier 即裸手机号，
 * 后端原生 login 对 identifier 做字符串匹配 —— 表单层不得用 email() 拦截手机号
 * （否则手机注册用户无法通过表单登录）。
 */
const IDENTIFIER_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$|^1[3-9]\d{9}$/;

export const LoginForm = object({
  identifier: pipe(
    string(),
    minLength(1, "Enter your email or phone number"),
    check((v) => IDENTIFIER_RE.test(v.trim()), "Enter a valid email or phone number"),
  ),
  password: pipe(string(), minLength(8, "Must be at least 8 characters")),
});

export type LoginForm = InferOutput<typeof LoginForm>;
