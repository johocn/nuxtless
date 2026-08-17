#!/usr/bin/env node
/**
 * 服务器常用运维脚本（ssh 别名 / host 从 .env 读取，不硬编码）
 *
 * 用法：
 *   node scripts/server-ops.mjs status          # pm2 进程状态
 *   node scripts/server-ops.mjs logs [-n 50]    # 查最近日志（先 flush 再 restart 再查，遵循 PM2 日志排查铁律）
 *   node scripts/server-ops.mjs health           # curl 站点健康检查
 *   node scripts/server-ops.mjs deploy           # 等价于 scripts/deploy.mjs
 *
 * 环境变量（.env / 进程环境，与 deploy.mjs 共用）：
 *   SERVER_HOST / SERVER_USER / SERVER_PORT / APP_NAME / PORT
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = process.cwd();
const scriptDir = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = { ...process.env };
  const envPath = resolve(scriptDir, "..", ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in env)) env[key] = value;
    }
  }
  return env;
}

const env = loadEnv();
// SERVER_HOST 直接用 ssh 别名（推荐，如 qing）或原始主机；BatchMode 避免密码/确认卡住。
const HOST = env.SERVER_HOST || "qing";
const SSH_ARGS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new"];
const PORT = env.SERVER_PORT || "";
if (PORT) SSH_ARGS.push("-p", PORT);
let target = HOST;
if (env.SERVER_USER) {
  SSH_ARGS.push("-l", env.SERVER_USER);
  target = `${env.SERVER_USER}@${HOST}`;
}
const APP = env.APP_NAME || "nshop";

function fail(msg) {
  console.error(`\n[ops] 错误：${msg}`);
  process.exit(1);
}

function ssh(remoteCmd) {
  console.log(`\n[ops] >> ssh ${HOST} · ${remoteCmd}`);
  const res = spawnSync("ssh", [...SSH_ARGS, target, remoteCmd], { stdio: "inherit", cwd });
  if (res.status !== 0) fail("远程执行失败");
}

function local(cmd, argv) {
  const res = spawnSync(cmd, argv, { stdio: "inherit", cwd });
  if (res.status !== 0) process.exit(res.status);
}

const cmd = process.argv[2];

switch (cmd) {
  case "status":
    ssh(`pm2 status ${APP}`);
    break;

  case "logs": {
    const nIdx = process.argv.indexOf("-n");
    const n = nIdx > -1 && process.argv[nIdx + 1] ? parseInt(process.argv[nIdx + 1], 10) : 50;
    // 遵循记忆「PM2 日志排查铁律」：默认显示历史累积日志，需先 flush 再 restart，才能看到真实当前状态
    ssh(`pm2 flush ${APP} && pm2 restart ${APP} && sleep 3 && pm2 logs ${APP} --lines ${n} --nostream`);
    break;
  }

  case "health":
    ssh(`curl -s -o /dev/null -w 'HTTP %{http_code} · %{time_total}s' http://localhost:${env.PORT || "8080"}/`);
    break;

  case "deploy":
    local("node", [resolve(scriptDir, "deploy.mjs")]);
    break;

  default:
    console.log(`用法：
  node scripts/server-ops.mjs status          # pm2 进程状态
  node scripts/server-ops.mjs logs [-n 50]    # 查最近日志（flush+restart+tail）
  node scripts/server-ops.mjs health          # 站点健康检查
  node scripts/server-ops.mjs deploy          # 本地 build + 上传 + pm2 重启`);
    break;
}