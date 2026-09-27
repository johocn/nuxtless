# -*- coding: utf-8 -*-
"""只读：宽口径抓取 t2 首页 GraphQL 请求（含 SSR 直出后的客户端请求），并复现打开城市面板。"""
import sys
import time
from pathlib import Path
from collections import Counter

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:
    print("ENV-FAIL: %s" % e)
    sys.exit(2)

URL = "https://www.youshop.cn/t2/"
TMP = Path(__file__).resolve().parent
OUT = TMP / "repro"
OUT.mkdir(parents=True, exist_ok=True)

reqs = []
resps = []
console = []
OPS = ["GetMenuCollections", "GetProductsByIds", "SearchProducts", "GetPickupLocations",
       "GetChannelTheme", "GetHomeContent", "ChannelDeliveryCapability", "GetMapDistricts",
       "ActiveChannel", "GetActiveChannel"]


import re as _re


def opname(body):
    for k in OPS:
        if k in body:
            return k
    m = _re.search(r'"operationName"\s*:\s*"([^"]+)"', body or "")
    if m:
        return m.group(1)
    m = _re.search(r'query\s+(\w+)', body or "")
    if m:
        return m.group(1)
    return "?"


def interesting(u):
    u = u.lower()
    return ("api" in u or "graphql" in u) and not u.endswith((".js", ".css", ".png", ".jpg", ".webp", ".svg", ".woff", ".woff2", ".ico"))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True, locale="zh-CN")
    pg = ctx.new_page()

    def on_req(r):
        try:
            if interesting(r.url):
                reqs.append((r.method, r.url, (r.post_data or "")[:400]))
        except Exception:
            pass

    def on_resp(r):
        try:
            if interesting(r.url):
                resps.append((r.status, r.url))
        except Exception:
            pass

    pg.on("request", on_req)
    pg.on("response", on_resp)
    pg.on("console", lambda m: console.append((m.type, m.text)) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: console.append(("pageerror", str(e)[:300])))

    print("[1] 打开首页（等 hydration + 客户端请求）")
    pg.goto(URL, wait_until="networkidle", timeout=60000)
    time.sleep(10)
    print("    请求数（含 api）=", len(reqs))
    for m, u, body in reqs:
        print("      %-5s %-70s op=%s" % (m, u[:70], opname(body)))

    print("\n[2] 打开城市选择面板（触发客户端 GetPickupLocations / GetMapDistricts）")
    btn = pg.get_by_role("button", name="选择城市")
    if not btn.count():
        btn = pg.get_by_role("button", name="长春")
    if btn.count():
        btn.first.click()
        time.sleep(5)
    pg.screenshot(path=str(OUT / "t2-net-panel.png"))

    print("\n[3] 全量统计")
    c = Counter(opname(bd) for _, _, bd in reqs)
    for k in OPS:
        print("    %-28s = %d" % (k, c.get(k, 0)))
    print("    其它 =", {k: v for k, v in c.items() if k not in OPS and k != "?"})
    print("    状态码 =", Counter(s for s, _ in resps))
    print("    4xx/5xx =", [(s, u[:90]) for s, u in resps if s >= 400][:15])

    # 分类导航链接
    print("\n[4] 分类导航内容")
    print("    main 内 category 链接数 =",
          pg.locator('main[data-layout="mobile"] a[href*="/category/"]').count())
    navtxt = pg.eval_on_selector_all(
        'main[data-layout="mobile"] nav, main[data-layout="mobile"] nav a',
        "els=>els.map(e=>e.textContent.trim()).filter(Boolean).slice(0,20)")
    print("    nav 文案 =", navtxt)
    print("    全页 category 链接 =",
          pg.eval_on_selector_all('a[href*="/category/"]', "els=>els.map(e=>e.textContent.trim()).filter(Boolean).slice(0,20)"))

    print("\n[5] console error/warning（最多10条）")
    for t, m in console[:10]:
        print("  [%s] %s" % (t, m[:240]))
    print("    合计 =", len(console))
    b.close()
print("\nDONE")