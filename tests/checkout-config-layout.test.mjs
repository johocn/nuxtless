// checkLayout 纯函数回归（无 vitest，Node v22 strip-types 直跑）
// 用法: node --experimental-strip-types tests/checkout-config-layout.test.mjs
import { checkLayout } from "../layers/base/app/utils/checkout-config.ts";

let pass = 0;
let fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`✗ ${label}: expected ${expected}, got ${actual}`); }
}

eq(checkLayout("cn"), "cn", "cn");
eq(checkLayout("jd"), "jd", "jd");
eq(checkLayout("legacy"), "legacy", "legacy");
eq(checkLayout("foo"), "cn", "非法值 foo 回退 cn");
eq(checkLayout(""), "cn", "空串回退 cn");
eq(checkLayout(null), "cn", "null 回退 cn");
eq(checkLayout(undefined), "cn", "undefined 回退 cn");

console.log(`\ncheckLayout: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);