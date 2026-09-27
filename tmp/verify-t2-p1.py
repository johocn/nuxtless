# -*- coding: utf-8 -*-
"""只读验收：「热门 / 推荐」装修积木线上渲染（A/B/C 三版式）+ 分类可见 + 酒店版式。
手机视口 390x844 @dpr2；不写数据（配置由 scripts/verify-t2-blocks-config.mjs 负责）。
用法：
  node scripts/verify-t2-blocks-config.mjs on-a && python tmp/verify-t2-p1.py a
  node scripts/verify-t2-blocks-config.mjs on-b && python tmp/verify-t2-p1.py b
  node scripts/verify-t2-blocks-config.mjs off  && python tmp/verify-t2-p1.py off
argv[1] 只用于给交付截图命名/断言（a=紧凑A+一大二小C / b=横滑B / off=京东兜底楼层）。
"""
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:
    print("ENV-FAIL: 需要 playwright → %s" % e)
    sys.exit(2)

BASE = "https://www.youshop.cn/t2/"
TMP = Path(__file__).resolve().parent
OUT = TMP / "repro"
DOC = TMP.parent / "docs" / "superpowers" / "manual" / "t2-visibility" / "shots"
OUT.mkdir(parents=True, exist_ok=True)
DOC.mkdir(parents=True, exist_ok=True)

MODE = (sys.argv[1] if len(sys.argv) > 1 else "off").lower()
HOME_SHOT = {
    "a": "06-t2-home-hotA-recommendC.png",
    "b": "07-t2-home-hotB.png",
}.get(MODE, "08-t2-home-fallback-hot-recommend.png")

ROOM_SLUG = "国信南山温泉节假日房间"   # 商品 60（房间，应命中 hotel 版式）
TICKET_SLUG = "温泉门票"              # 商品 59（门票，不应命中 hotel 版式）

OPS = ["GetMenuCollections", "GetProductsByIds", "SearchProducts", "GetPickupLocations",
       "GetChannelTheme", "GetHomeContent", "ChannelDeliveryCapability", "GetProductsBySlugs"]


def open_page(ctx, url, tag=""):
    pg = ctx.new_page()
    errs = []
    api = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
    pg.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type in ("error", "warning") else None)

    def on_resp(r):
        try:
            if "shop-api" not in r.url:
                return
            body = r.request.post_data or ""
            op = next((o for o in OPS if o in body), "?")
            api.append((op, r.status))
        except Exception:
            pass

    pg.on("response", on_resp)
    pg.goto(url, wait_until="networkidle", timeout=90000)
    pg.wait_for_timeout(3000)
    return pg, errs, api


def main():
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)

        # ① 首页：分类导航 + 积木楼层
        pg, errs, api = open_page(ctx, BASE)
        cat = pg.eval_on_selector_all('a[href*="/category/"]',
                                      "els => els.map(e => (e.innerText||'').trim() + '→' + e.getAttribute('href'))")
        prod = pg.eval_on_selector_all('a[href*="/product/"]', "els => els.map(e => e.getAttribute('href'))")
        heads = pg.eval_on_selector_all('h2, .font-bold', "els => els.map(e => (e.innerText||'').trim()).filter(Boolean)")
        body = pg.inner_text("body")
        slug = pg.evaluate("() => Array.from(document.querySelectorAll('a[href*=\"/product/\"]')).map(a => a.getAttribute('href')).join('|')")
        pg.screenshot(path=str(OUT / ("p1-home-%s.png" % MODE)), full_page=True)
        pg.screenshot(path=str(DOC / HOME_SHOT), full_page=True)
        html = pg.content()
        rows.append(("首页 category 链接", len(cat), cat))
        rows.append(("首页 唯一 product 链接", len(set(prod)), sorted(set(prod))))
        rows.append(("首页 含死链 /product\\)$", "/product)" in slug or slug.endswith("/product"), ""))
        rows.append(("首页 含「暂无可用商品」", "暂无可用商品" in body, ""))
        rows.append(("首页 楼层标题候选", "", heads[:12]))
        rows.append(("首页 版式标记", "mode=%s" % MODE, {
            "A 紧凑 grid-cols-2": "grid-cols-2" in html,
            "B 横滑 snap-x": "snap-x" in html,
            "C 一大二小 aspect-16/9": "aspect-[16/9]" in html,
            "兜底楼层(afterFilter)": "暂无可用商品" in body,
        }))
        rows.append(("首页 shop-api 请求", len(api), api))
        rows.append(("首页 错误/告警", len(errs), errs[:6]))
        pg.close()

        # ② 分类页：点击分类是否可用
        if cat:
            href = cat[0].split("→")[-1]
            # href 由页面内链接取出、已含租户前缀（/t2/category/...），不能再拼 BASE（否则 /t2/t2/...）
            pg, errs, _ = open_page(ctx, "https://www.youshop.cn" + href)
            cbody = pg.inner_text("body")
            cprod = pg.eval_on_selector_all('a[href*="/product/"]', "els => els.map(e => e.getAttribute('href'))")
            pg.screenshot(path=str(OUT / "p1-category.png"), full_page=True)
            pg.screenshot(path=str(DOC / "04-t2-category-page.png"), full_page=True)
            rows.append(("分类页 唯一商品数", len(set(cprod)), href))
            rows.append(("分类页 错误/告警", len(errs), errs[:5]))
            pg.close()

        # ③ 房间商品详情（应命中 hotel 版式）
        pg, errs, _ = open_page(ctx, BASE + "product/" + ROOM_SLUG)
        t = pg.inner_text("body")
        pg.screenshot(path=str(OUT / "p1-room.png"), full_page=True)
        pg.screenshot(path=str(DOC / "05-t2-room-detail-hotel.png"), full_page=True)
        rows.append(("房间60：含房型规格(㎡)", "㎡" in t, ""))
        rows.append(("房间60：含床型描述", "豪华大床" in t, ""))
        rows.append(("房间60：错误/告警", len(errs), errs[:5]))
        pg.close()

        # ④ 门票商品详情（反证：不应命中 hotel 版式）
        pg, errs, _ = open_page(ctx, BASE + "product/" + TICKET_SLUG)
        t2 = pg.inner_text("body")
        rows.append(("门票59：不应含房型规格(㎡)", "㎡" not in t2, ""))
        pg.close()

        browser.close()

    print("=" * 70)
    for name, val, extra in rows:
        print("%-30s %s  %s" % (name, val, extra if extra else ""))
    print("=" * 70)
    print("过程截图 → %s" % OUT)
    print("交付截图 → %s" % DOC)


if __name__ == "__main__":
    main()