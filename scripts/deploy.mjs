#!/usr/bin/env node
/**
 * nshop 部署脚本
 *
 * 遵守部署铁律：本地构建 → 上传 .output/ 到服务器 → pm2 restart（绝不在服务器构建/安装依赖）。
 * Nuxt `node-server` 产物可独立运行（服务器无需 `npm install`）。
 *
 * 环境变量（从 .env / 进程环境读取，不硬编码域名）：
 *   SERVER_HOST     服务器主机或 IP（必填）
 *   SERVER_USER     SSH 用户名（默认 root）
 *   SERVER_PORT     SSH/SCP 端口（默认 22）
 *   REMOTE_DIR      服务器上 .output/ 所在目标目录（必填，例如 /opt/www/nshop）
 *   APP_NAME        pm2 进程名（默认 nshop）
 *   PORT            站点监听端口（默认 8080，透传给服务器启动）
 *   SKIP_BUILD      设为 1 时跳过本地构建（仅上传+重启）
 *
 * 用法：
 *   node scripts/deploy.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = process.cwd();
const scriptDir = dirname(fileURLToPath(import.meta.url));

/**
 * 加载 .env（轻量 dotenv，避免新增依赖）。进程环境变量优先。
 */
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

const SERVER_HOST = env.SERVER_HOST;
const SERVER_USER = env.SERVER_USER || "root";
const SERVER_PORT = env.SERVER_PORT || "22";
const REMOTE_DIR = env.REMOTE_DIR;
const APP_NAME = env.APP_NAME || "nshop";
const PORT = env.PORT || "8080";
const SKIP_BUILD = env.SKIP_BUILD === "1";

const outputDir = resolve(cwd, ".output");

function fail(msg) {
  console.error(`\n[deploy] 错误：${msg}`);
  process.exit(1);
}

/** 执行本地命令（argv 数组，不经 shell，避免转义问题）。 */
function run(label, argv, opts = {}) {
  console.log(`\n[deploy] >> ${label}\n  ${argv.join(" ")}`);
  const res = spawnSync(argv[0], argv.slice(1), {
    stdio: "inherit",
    cwd,
    ...opts,
  });
  if (res.status !== 0) fail(`${label} 失败（exit=${res.status}）`);
  return res.stdout;
}

/** 通过 ssh 执行远端命令。 */
function ssh(remoteCmd) {
  run("远端执行", [
    "ssh",
    "-p",
    SERVER_PORT,
    "-o",
    "StrictHostKeyChecking=accept-new",
    `${SERVER_USER}@${SERVER_HOST}`,
    remoteCmd,
  ]);
}

const requires = [
  ["SERVER_HOST", SERVER_HOST],
  ["REMOTE_DIR", REMOTE_DIR],
];
for (const [name, val] of requires) {
  if (!val) fail(`缺少环境变量 ${name}（可在 .env 中配置）`);
}

// 1) 本地构建
if (!SKIP_BUILD) {
  run("本地构建", ["pnpm", "build"]);
} else {
  console.log("\n[deploy] 已设置 SKIP_BUILD=1，跳过本地构建。");
}

// 2) 校验产物
if (!existsSync(resolve(outputDir, "server", "index.mjs"))) {
  fail(`未找到产物 ${resolve(outputDir, "server", "index.mjs")}，请先在本地执行 pnpm build。`);
}

// 3) 上传 .output/ 到服务器（先清空远端旧目录避免残留陈旧代码）
console.log(`\n[deploy] >> 上传 .output/ 到 ${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}`);
run("清理远端旧目录", [
  "ssh",
  "-p",
  SERVER_PORT,
  `${SERVER_USER}@${SERVER_HOST}`,
  `rm -rf ${REMOTE_DIR} && mkdir -p ${REMOTE_DIR}`,
]);
run("SCP 上传 .output/", ["scp", "-P", SERVER_PORT, "-r", outputDir, `${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}`]);

// 4) pm2 startOrRestart（首次自动启动；服务器不安装任何依赖）
console.log(`\n[deploy] >> 启动/重启 pm2 进程 ${APP_NAME}`);
const restartCmd =
  `if pm2 id ${APP_NAME} >/dev/null 2>&1; then ` +
  `pm2 restart ${APP_NAME} --cwd ${REMOTE_DIR} --update-env; ` +
  `else cd ${REMOTE_DIR} && PORT=${PORT} NODE_ENV=production pm2 start server/index.mjs --name ${APP_NAME} --update-env -i 1; fi`;
ssh(restartCmd);

// 5) 输出状态
ssh(`pm2 status ${APP_NAME}`);

console.log(`\n[deploy] 完成。站点：http://${SERVER_HOST}:${PORT}/`);
console.log(
  `[deploy] 验证：ssh ${SERVER_USER}@${SERVER_HOST} "curl -s -o /dev/null -w '%{http_code}' http://localhost:${PORT}/"`
);