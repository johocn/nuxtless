# -*- coding: utf-8 -*-
"""补拍「就近库存」区域手机截图（滚动到该区域，供操作手册附图）"""
import json
from urllib.parse import quote
from playwright.sync_api import sync_playwright

DOMAIN = "https://www.youshop.cn"
PRODUCT = "国信南山温泉节假日房间"
URL = f"{DOMAIN}/t2/product/{quote(PRODUCT)}"
OUT = r"d:\zhao\nshop\tmp-shots\manual-nearby-region.png"

CITY_STATE = {
    "city": {"name": "长春市", "adcode": "220100"},
    "coords": None,
    "source": "manual",
    "geo": None,
}

with sync_playwright() as p:
    ctx = p.chromium.launch(headless=True).new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        locale="zh-CN",
    )
    page = ctx.new_page()
    page.goto(DOMAIN, wait_until="domcontentloaded", timeout=60000)
    page.evaluate(
        "([s]) => document.cookie = 'location=' + encodeURIComponent(JSON.stringify(s)) + '; path=/; SameSite=Lax'",
        [CITY_STATE],
    )
    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(2500)

    near = page.locator("text=就近库存").first
    print("nearby found:", near.count())
    near.scroll_into_view_if_needed()
    page.wait_for_timeout(1200)
    parent = near.locator("xpath=..")
    txt = parent.inner_text() if parent.count() else ""
    print("NEARBY_TEXT:", repr(txt))
    page.screenshot(path=OUT, full_page=False)
    ctx.close()
    print("SHOT_SAVED", OUT)
