# -*- coding: utf-8 -*-
"""只读验收：t2 首页「未选城市不过滤」P0 修复 + 可用城市面板（手机视口 390x844 @dpr2）。
不写任何数据、不下单、不提交。仅浏览 + DOM 查询 + 截图。
"""
import re
import sys
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:
    print("ENV-FAIL: 需要 playwright → %s" % e)
    sys.exit(2)

URL = "https://www.youshop.cn/t2/"
TMP = Path(__file__).resolve().parent
OUT = TMP / "repro"
DOC = TMP.parent / "docs" / "superpowers" / "manual" / "t2-visibility" / "shots"
OUT.mkdir(parents=True, exist_ok=True)
DOC.mkdir(parents=True, exist_ok=True)

OPS = ["GetMenuCollections", "GetProductsByIds", "SearchProducts", "GetPickupLocations",
       "GetChannelTheme", "GetHomeContent", "ChannelDeliveryCapability", "GetMapDistricts"]

console_msgs = []   # (type, text)
api_calls = []      # dict(url, status, op)
bad_resp = []       # (status, url)


def opname(body):
    for k in OPS:
        if k in body:
            return k
    return "?"


def attach(page):
    page.on("console", lambda m: console_msgs.append((m.type, m.text))
            if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: console_msgs.append(("pageerror", str(e)[:300])))

    def on_resp(r):
        try:
            req = r.request
            if req.method != "POST":
                return
            u = r.url
            if "shop-api" not in u and "/api" not in u:
                return
            api_calls.append({"url": u, "status": r.status(),
                              "op": opname(req.post_data or "")})
        except Exception:
            pass

    page.on("response", on_resp)

    def on_any(r):
        try:
            if r.status >= 400:
                bad_resp.append((r.status, r.url))
        except Exception:
            pass

    page.on("response", on_any)


def product_stats(page):
    hrefs = page.eval_on_selector_all(
        'a[href*="/product/"]', "els => els.map(e => e.getAttribute('href'))")
    uniq = list(dict.fromkeys(hrefs))
    return len(hrefs), uniq


def mobile_titles(page):
    return page.eval_on_selector_all(
        'main[data-layout="mobile"] h1, main[data-layout="mobile"] h2, main[data-layout="mobile"] h3',
        "els => els.map(e => e.textContent.trim()).filter(Boolean)")


def layout_probe(page):
    return page.evaluate("""() => {
        const m = document.querySelector('main[data-layout="mobile"]');
        if (!m) return {mobile_main:false};
        const t = m.innerText || '';
        const cats = m.querySelectorAll('a[href*="/category/"]').length;
        const prods = m.querySelectorAll('a[href*="/product/"]').length;
        const children = Array.from(m.children).map(c => c.tagName.toLowerCase()+'.'+
            (c.className||'').toString().split(' ').slice(0,2).join('.'));
        return {
            mobile_main: true,
            brandFlash: t.includes('品牌闪购'),
            allProductsChip: t.includes('全部商品'),
            qualityZone: t.includes('品质专区'),
            emptyAfterFilter: t.includes('当前城市/配送方式下暂无可用商品'),
            categoryLinks: cats,
            productLinks: prods,
            children: children.slice(0, 20),
        };
    }""")


def run(page):
    # ── 步骤 1/2：未选城市（干净 context）首页 ──
    print("=" * 70)
    print("[步骤1/2] 打开 t2 首页（干净上下文，未选城市）")
    page.goto(URL, wait_until="networkidle", timeout=60000)
    time.sleep(9)
    print("    URL =", page.url)
    raw_n, uniq = product_stats(page)
    print("    商品链接总数 =", raw_n, "| 去重后 =", len(uniq))
    print("    去重 href 前 6 =", uniq[:6])
    print("    楼层标题 =", mobile_titles(page))
    body = page.inner_text("body")
    for kw in ["热门商品", "推荐", "暂无可用商品", "当前城市/配送方式下暂无可用商品"]:
        print(f"    正文含「{kw}」= {kw in body}")
    probe = layout_probe(page)
    print("    布局探针 =", probe)
    page.screenshot(path=str(OUT / "t2-home-nocity-full.png"), full_page=True)
    page.screenshot(path=str(OUT / "t2-home-nocity-vp.png"))
    page.screenshot(path=str(DOC / "01-t2-home-nocity.png"), full_page=True)

    # ── 步骤 3：打开城市选择面板 ──
    print("\n[步骤3] 打开城市选择面板")
    city_btn = None
    # 方式1：role=button 且可访问名含「选择城市/定位中/长春」
    pat = re.compile("选择城市|定位中|长春")
    loc = page.get_by_role("button", name=pat)
    print("    方式1 命中按钮数 =", loc.count())
    if loc.count():
        for i in range(loc.count()):
            el = loc.nth(i)
            try:
                if el.is_visible():
                    city_btn = el
                    break
            except Exception:
                pass
        if city_btn is None:
            city_btn = loc.first
    if city_btn is None:
        # 方式2：任意可点击元素文本匹配
        loc2 = page.locator("button, a, [role=button]").filter(has_text=re.compile("选择城市|定位中|长春"))
        print("    方式2 命中数 =", loc2.count())
        if loc2.count():
            city_btn = loc2.first

    if city_btn is None:
        print("    !! 未找到城市选择入口，跳过步骤3/4")
        return

    try:
        print("    入口文本 =", city_btn.inner_text().strip())
    except Exception:
        pass
    city_btn.click()
    time.sleep(3.5)

    # 面板取证
    panel_ok = False
    try:
        page.wait_for_selector("text=可用城市", timeout=6000)
        panel_ok = True
    except Exception:
        try:
            page.wait_for_selector("text=热门城市", timeout=4000)
            panel_ok = True
        except Exception:
            pass
    print("    面板是否出现 =", panel_ok)
    panel_probe = page.evaluate("""() => {
        const dlg = document.querySelector('[role="dialog"]');
        const root = dlg || document.body;
        const t = (root.innerText || '').split('\\n').map(s=>s.trim()).filter(Boolean);
        return { hasDialog: !!dlg, lines: t.slice(0, 30),
                 hasAvailable: (root.innerText||'').includes('可用城市'),
                 hasHot: (root.innerText||'').includes('热门城市') };
    }""")
    print("    面板内容 =", panel_probe)
    print("    按钮列表 =", page.eval_on_selector_all(
        '[role="dialog"] button, [role="dialog"] a',
        "els=>els.map(e=>e.textContent.trim()).filter(Boolean).slice(0,25)"))
    page.screenshot(path=str(OUT / "t2-city-panel-full.png"), full_page=True)
    page.screenshot(path=str(OUT / "t2-city-panel-vp.png"))
    page.screenshot(path=str(DOC / "02-t2-city-panel.png"), full_page=True)

    # ── 步骤 4：选中「长春市」→ 回首页 ──
    print("\n[步骤4] 点选「长春市」")
    cc = page.get_by_role("button", name="长春市", exact=True)
    print("    「长春市」按钮数 =", cc.count())
    if not cc.count():
        cc = page.get_by_text("长春市", exact=True)
        print("    文本方式命中数 =", cc.count())
    if cc.count():
        cc.first.click()
        time.sleep(6)
        print("    选择后 URL =", page.url)
        raw_n2, uniq2 = product_stats(page)
        print("    商品链接总数 =", raw_n2, "| 去重后 =", len(uniq2))
        print("    楼层标题 =", mobile_titles(page))
        print("    布局探针 =", layout_probe(page))
        page.screenshot(path=str(OUT / "t2-home-changchun-full.png"), full_page=True)
        page.screenshot(path=str(OUT / "t2-home-changchun-vp.png"))
        page.screenshot(path=str(DOC / "03-t2-home-changchun.png"), full_page=True)
    else:
        print("    !! 面板里未找到「长春市」，跳过步骤4")


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True, locale="zh-CN")
    pg = ctx.new_page()
    attach(pg)
    try:
        run(pg)
    finally:
        print("\n" + "=" * 70)
        print("===== 网络取证 =====")
        from collections import Counter
        c = Counter(x["op"] for x in api_calls)
        for k in OPS:
            print(f"    {k} 次数 = {c.get(k, 0)}")
        print("    其它 POST =", {k: v for k, v in c.items() if k not in OPS and k != "?"})
        print("    API 状态码分布 =", Counter(x["status"] for x in api_calls))
        print("    4xx/5xx 响应 =", bad_resp[:20])
        print("\n===== console error/warning（最多10条）=====")
        for t, m in console_msgs[:10]:
            print(f"  [{t}] {m[:240]}")
        print("    合计 =", len(console_msgs))
        b.close()
print("\nDONE")