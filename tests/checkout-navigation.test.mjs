// 结算页「自提点就近」+「导航」纯函数回归。
// 无 vitest：Node v22 直跑 —— node --experimental-strip-types tests/checkout-navigation.test.mjs
import {
  parseCoordinates,
  haversineKm,
  PICKUP_RADIUS_KM,
  nearbyPickups,
} from "../layers/base/app/utils/checkout-config.ts";

let pass = 0;
let fail = 0;
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; console.error(`✗ ${label}`); }
}
function eq(a, b, label) {
  if (Object.is(a, b)) pass++;
  else { fail++; console.error(`✗ ${label}: expected ${b}, got ${a}`); }
}

// parseCoordinates → { lat, lng } | null
eq(parseCoordinates(null), null, "null 坐标 → null");
eq(parseCoordinates(""), null, "空串坐标 → null");
eq(parseCoordinates("{bad json"), null, "坏 JSON → null");
eq(parseCoordinates('{"lat":"x","lng":12}'), null, "lat 非数字 → null");
eq(parseCoordinates("abc"), null, "非数字字符串 → null");
const obj = parseCoordinates({ lat: 30.1, lng: 120.2 });
ok(obj?.lat === 30.1 && obj?.lng === 120.2, "对象 {lat,lng} 解析");
const str = parseCoordinates("30.1,120.2");
ok(str?.lat === 30.1 && str?.lng === 120.2, "逗号分隔字符串解析");
ok(
  parseCoordinates('{"latitude":30.1}') === null,
  "缺 lng 键 → null",
);

// haversineKm（北京-上海约 1067km）
const bj = { lat: 39.9042, lng: 116.4074 };
const sh = { lat: 31.2304, lng: 121.4737 };
const d = haversineKm(bj, sh);
ok(d > 1000 && d < 1150, `北京-上海距离合理: ${d.toFixed(0)}km`);

// PICKUP_RADIUS_KM
eq(PICKUP_RADIUS_KM, 50, "就近半径 = 50km");

// nearbyPickups
const hz = { lat: 30.274, lng: 120.155 }; // 杭州
const pickupA = { id: 1, name: "杭州湖滨店", coordinates: "30.25,120.16", address: "a" }; // ~3km 近
const pickupB = { id: 2, name: "上海外滩店", coordinates: "31.23,121.47", address: "b" }; // ~150km 远
const pickupC = { id: 3, name: "杭州未来科技城", coordinates: "30.29,120.01", address: "c" }; // ~16km 中
const loc = (p) => parseCoordinates(p.coordinates);

// 无坐标参数 → 原样返回（不做过滤）
eq(
  nearbyPickups([pickupA, pickupB], null, loc).length,
  2,
  "无定位回退全部",
);

// 有定位 → 只保留 ≤50km 且按距离升序
const near = nearbyPickups([pickupB, pickupC, pickupA], hz, loc);
eq(near.length, 2, "50km 内应保留 2 个（湖滨+科技城）");
eq(near[0].id, 1, "最近者排第一（杭州湖滨店）");
eq(near[1].id, 3, "第二近排第二（杭州未来科技城）");
ok(!near.some((x) => x.id === 2), "远距（外滩）被过滤");

// 空列表
eq(nearbyPickups([], hz, loc).length, 0, "空列表返回空");

// 全部超距时回退全部（保证至少可浏览）
const farShanghai = { id: 4, name: "上海虹桥店", coordinates: "31.20,121.32", address: "s" };
const farBeijing = { id: 5, name: "北京西单店", coordinates: "39.90,116.37", address: "b" };
const allFar = nearbyPickups([farShanghai, farBeijing], hz, loc);
eq(allFar.length, 2, "全超距回退全部");

// restrict=false 跳过过滤
eq(nearbyPickups([pickupB, pickupA], hz, loc, false).length, 2, "restrict=false 不过滤");

// 导航 URI 纯函数（usePickupNavigation.buildNavigationUri 的核心逻辑，避免 import Nuxt 上下文）
function buildUri(pickup) {
  const c = parseCoordinates(pickup?.coordinates);
  if (!c) return null;
  const name = encodeURIComponent(pickup?.name || "自提点");
  return `https://uri.amap.com/navigation?to=${c},${name}&mode=car&src=nshop&coordinate=gaode&callnative=1`;
}
const uri = buildUri(pickupA);
ok(uri != null && uri.startsWith("https://uri.amap.com/navigation?to="), "导航 URI 前缀正确");
ok(uri.includes("coordinate=gaode&callnative=1"), "导航 URI 携带唤起导航参数");
eq(buildUri({ name: "x", coordinates: "bad" }), null, "无有效坐标 → 不生成 URI");

console.log(`\ncheckout-navigation: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);