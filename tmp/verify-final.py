# -*- coding: utf-8 -*-
"""最终验收：手机视口截图 + 六项修复断言（本地跑完可对线上重跑）。
视口铁律: 390x844, dpr=2, is_mobile, has_touch, locale=zh-CN。
"""
import json
import re
from urllib.parse import quote
from playwright.sync_api import sync_playwright

DOMAIN = "https://www.youshop.cn"
PAGES = [
    ("hotel", f"{DOMAIN}/t2/product/{quote('国信南山温泉节假日房间')}"),
    ("ticket", f"{DOMAIN}/t2/product/{quote('温泉门票')}"),
]
OUT = r"d:\zhao\nshop\tmp-shots"

# 无定位、有城市（就近库存城市兜底场景）
CITY_STATE = {
    "city": {"name": "长春市", "adcode": "220100"},
    "coords": None,
    "source": "manual",
    "geo": None,
}


def new_ctx(browser, width=390, height=844):
    return browser.new_context(
        viewport={"width": width, "height": height},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        locale="zh-CN",
    )


def check_detail(page, key, url):
    page.goto(url, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1500)
    # 1) 缩略图条可横滑 + n/m 角标
    thumbs = page.locator(".no-scrollbar")
    counter = page.locator("text=/^\\d+\\/\\d+$/").first
    # 2) 促销/服务条（截图人工确认来自后台方案库；有商品覆盖时仅显示覆盖项）
    promo = page.locator("text=促销").first
    promo_text = ""
    if promo.count():
        promo_text = promo.locator("xpath=..").inner_text().replace("\n", " | ")[:80]
    # 3) 就近库存：无定位无城市 → 定位引导；无定位有城市 → 按城市查询（无「开启定位可查看就近库存」）
    no_coords_hint = page.get_by_text("开启定位可查看就近库存").count()
    # 4) 营销标签角标（主图右上红色角标，Tailwind 类 bg-red-500/90）
    tags = page.locator("span[class*=bg-red-500]").all_inner_texts()[:6]
    # 5) 面包屑：顶级分类「休闲娱乐」出现
    crumb_ok = page.get_by_text("休闲娱乐", exact=False).count() > 0
    crumb = page.locator("nav[aria-label*=breadcrumb], ol").first
    crumb_text = crumb.inner_text().replace("\n", " > ") if crumb.count() else ""
    # 6) 底栏
    bottom = page.locator("nav[aria-label='商品详情底部操作栏']").first
    bottom_text = bottom.inner_text().replace("\n", " | ") if bottom.count() else ""
    page.screenshot(path=f"{OUT}/verify-final-{key}.png", full_page=False)
    print(f"===== {key}")
    print(f"  thumbs_container={thumbs.count()} n/m={counter.count() and counter.inner_text()}")
    print(f"  promo: {promo_text}")
    print(f"  no_coords_hint_count={no_coords_hint} (无城市场景应为 1)")
    print(f"  tags: {tags}")
    print(f"  breadcrumb: {crumb_text} | top_found={crumb_ok}")
    print(f"  bottom: {bottom_text}")


def check_city_fallback(page):
    """注入 cookie（location store 默认持久化到 cookie，非 localStorage）→ 就近库存按城市兜底"""
    from urllib.parse import quote
    page.goto(DOMAIN, wait_until="domcontentloaded", timeout=60000)
    page.evaluate(
        "([s]) => document.cookie = 'location=' + encodeURIComponent(JSON.stringify(s)) + '; path=/; SameSite=Lax'",
        [CITY_STATE],
    )
    page.goto(PAGES[0][1], wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1500)
    near = page.locator("text=就近库存")
    txt = ""
    if near.count():
        txt = near.first.locator("xpath=..").inner_text()
    hint = "开启定位可查看就近库存" in txt
    print(f"===== city-fallback")
    print(f"  nearby_text: {txt!r}")
    print(f"  still_shows_loc_hint={hint} (应为 False)")
    page.screenshot(path=f"{OUT}/verify-final-city-fallback.png", full_page=False)


def check_narrow_bottombar(page):
    """窄屏 360px：底栏仅返回 + 双按钮（首页按钮视觉隐藏）"""
    page.goto(PAGES[0][1], wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1000)
    bar = page.locator("nav[aria-label='商品详情底部操作栏']")
    btns = bar.locator("button, a")
    items = []
    for i in range(btns.count()):
        b = btns.nth(i)
        visible = b.is_visible()
        txt = b.inner_text().replace("\n", "/") if visible else "(hidden)"
        items.append(f"{txt}:{visible}")
    home_visible = bar.get_by_text("首页", exact=True).count() and bar.get_by_text("首页", exact=True).is_visible()
    print(f"===== narrow-bottombar(360px)")
    print(f"  buttons: {items}")
    print(f"  home_visible={home_visible} (应为 False)")
    page.screenshot(path=f"{OUT}/verify-final-bottombar-narrow.png", full_page=False)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = new_ctx(browser)
        page = ctx.new_page()
        for key, url in PAGES:
            check_detail(page, key, url)
        check_city_fallback(page)
        ctx.close()

        nctx = new_ctx(browser, width=360, height=780)
        npage = nctx.new_page()
        check_narrow_bottombar(npage)
        nctx.close()
        browser.close()


if __name__ == "__main__":
    main()
