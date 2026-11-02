// 管理员脚本统一凭证入口：后台账号/密码只能来自环境变量，缺失即退出。
// 仓库内禁止写死任何生产口令（历史版本曾把 superadmin 密码提交进 git，已清理）。
//
// 用法（PowerShell）:
//   $env:ADMIN_EMAIL="<后台账号>"; $env:ADMIN_PASSWORD="<后台密码>"; node scripts/xxx.mjs
// 用法（bash）:
//   ADMIN_EMAIL=<后台账号> ADMIN_PASSWORD=<后台密码> node scripts/xxx.mjs
// ADMIN_API 允许有默认域名；账号密码不允许有默认值。
export const ADMIN_API = process.env.ADMIN_API || "https://e.joho.cn/admin-api";

/** 取必填环境变量，缺失时打印用法并退出（退出码 1）。 */
export function requireEnv(name, hint = "") {
  const v = (process.env[name] || "").trim();
  if (!v) {
    console.error(`[配置错误] 缺少环境变量 ${name}${hint ? `（${hint}）` : ""}`);
    console.error('  PowerShell: $env:' + name + '="<值>"');
    console.error(`  bash:       ${name}=<值> node <脚本>`);
    process.exit(1);
  }
  return v;
}

/** 管理员登录凭证：ADMIN_EMAIL（兼容旧名 ADMIN_USER）+ 必填 ADMIN_PASSWORD。 */
export function requireAdminCredentials() {
  const username = (process.env.ADMIN_EMAIL || process.env.ADMIN_USER || "").trim();
  const password = (process.env.ADMIN_PASSWORD || "").trim();
  if (!username || !password) {
    console.error("[配置错误] 缺少管理员凭证，脚本已终止（不会使用任何内置默认口令）。");
    console.error('  PowerShell: $env:ADMIN_EMAIL="<后台账号>"; $env:ADMIN_PASSWORD="<后台密码>"');
    console.error("  bash:       ADMIN_EMAIL=<后台账号> ADMIN_PASSWORD=<后台密码> node <脚本>");
    process.exit(1);
  }
  return { username, password };
}
