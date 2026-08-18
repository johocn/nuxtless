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
  // 以进程环境为基准：进程环境变量优先于 .env（不做覆盖），
  // 但 .env 内部允许后定义覆盖先定义（如顶部 PORT=3001 用于本地 dev，
  // 底部部署段 PORT=3000 用于生产透传，后者需生效）。
  const baseEnv = { ...process.env };
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
      if (!(key in baseEnv)) env[key] = value;
    }
  }
  return env;
}

const env = loadEnv();

const SERVER_HOST = env.SERVER_HOST;
const SERVER_USER = env.SERVER_USER || "";
const SERVER_PORT = env.SERVER_PORT || "";
const REMOTE_DIR = env.REMOTE_DIR;
const APP_NAME = env.APP_NAME || "nshop";
const PORT = env.PORT || "8080";
const SKIP_BUILD = env.SKIP_BUILD === "1";

// 优先把 SERVER_HOST 当 ssh 别名（如 .ssh/config 的 qing 已含 User/Port/IdentityFile）；
// 显式给了 SERVER_USER/SERVER_PORT 时才覆盖。BatchMode=yes 避免密码/确认卡住。
const SSH_ARGS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new"];
if (SERVER_PORT) SSH_ARGS.push("-p", SERVER_PORT);
if (SERVER_USER) SSH_ARGS.push("-l", SERVER_USER);
const target = SERVER_USER ? `${SERVER_USER}@${SERVER_HOST}` : SERVER_HOST;

const outputDir = resolve(cwd, ".output");

function fail(msg) {
  console.error(`\n[deploy] 错误：${msg}`);
  process.exit(1);
}

/**
 * 执行本地命令（argv 数组，默认不经 shell 避免转义问题）。
 * 传 opts.shellCat 时改走 shell（Windows 下 pnpm/npm 是 .cmd shim，需 shell 才能执行）。
 */
function run(label, argv, opts = {}) {
  const { shellCat, ...rest } = opts;
  console.log(`\n[deploy] >> ${label}\n  ${shellCat ?? argv.join(" ")}`);
  const res = spawnSync(shellCat ?? argv[0], shellCat ? undefined : argv.slice(1), {
    stdio: "inherit",
    cwd,
    ...(shellCat ? { shell: true } : {}),
    ...rest,
  });
  if (res.status !== 0) fail(`${label} 失败（exit=${res.status}）`);
  return res.stdout;
}

/** 通过 ssh 执行远端命令（数组参数，不经 shell 避免转义）。 */
function ssh(remoteCmd) {
  run("远端执行", [...["ssh", ...SSH_ARGS, target, remoteCmd]]);
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
  // Windows 下 pnpm 是 .cmd shim，须经 shell 执行
  run("本地构建", ["pnpm", "build"], { shellCat: "pnpm build" });
} else {
  console.log("\n[deploy] 已设置 SKIP_BUILD=1，跳过本地构建。");
}

// 2) 校验产物
if (!existsSync(resolve(outputDir, "server", "index.mjs"))) {
  fail(`未找到产物 ${resolve(outputDir, "server", "index.mjs")}，请先在本地执行 pnpm build。`);
}

// 3) 上传 .output/ 到服务器
// 目标目录多为 root 所有（如 1panel 站点），admin 无写权限但一般有免密 sudo：
// 先 scp 到暂存区，再用 sudo 清空并拷贝进 REMOTE_DIR，避免对站点根文件的删除权限问题。
const STAGING = "/tmp/nshop-deploy";
console.log(`\n[deploy] >> 上传 .output/ 到 ${target}:${REMOTE_DIR}`);
run("准备暂存目录", ["ssh", ...SSH_ARGS, target, `rm -rf ${STAGING} && mkdir -p ${STAGING}`]);
run("SCP 上传 .output/ 到暂存区", ["scp", ...SSH_ARGS, "-r", outputDir, `${target}:${STAGING}`]);
ssh(
  `sudo rm -rf ${REMOTE_DIR} && sudo mkdir -p ${REMOTE_DIR} && ` +
    `sudo cp -r ${STAGING}/.output/. ${REMOTE_DIR}/ && ` +
    `sudo chown -R $(whoami):$(whoami) ${REMOTE_DIR} && rm -rf ${STAGING}`
);

// 4) pm2 startOrRestart（首次自动启动；服务器不安装任何依赖）
console.log(`\n[deploy] >> 启动/重启 pm2 进程 ${APP_NAME}`);
// 用 pm2 describe 判断进程是否存在（比 pm2 id 的退出码更可靠），不存在则 start，存在则 restart
const restartCmd =
  `if pm2 describe ${APP_NAME} >/dev/null 2>&1; then ` +
  `cd ${REMOTE_DIR} && PORT=${PORT} NODE_ENV=production pm2 restart ${APP_NAME} --update-env; ` +
  `else cd ${REMOTE_DIR} && PORT=${PORT} NODE_ENV=production pm2 start server/index.mjs --name ${APP_NAME} --update-env -i 1; fi`;
ssh(restartCmd);

// 5) 输出状态
ssh(`pm2 status ${APP_NAME}`);

console.log(`\n[deploy] 完成。站点：http://${SERVER_HOST}:${PORT}/`);
console.log(`[deploy] 验证：ssh ${target} "curl -s -o /dev/null -w '%{http_code}' http://localhost:${PORT}/"`);