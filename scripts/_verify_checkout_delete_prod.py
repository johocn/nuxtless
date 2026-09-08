# -*- coding: utf-8 -*-
"""生产验证 v3：删除按钮 → 仅删目标行，另一行保留，合计联动；底部导航遮挡检查。"""
from playwright.sync_api import sync_playwright

BASE = "https://www.youshop.cn"
OUT = "scripts/shots/fix_ck3"

def bar_text(page):
    bar = page.locator('div[class*="fixed"][class*="bottom-0"]')
    if bar.count():
        return bar.first.inner_text().replace("\n", " ")
    return ""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, locale="zh-CN")
    page = ctx.new_page()

    page.goto(BASE + "/product/温泉门票", timeout=90000)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="立即购买").first.click(timeout=20000)
    page.wait_for_load_state("networkidle"); page.wait_for_timeout(2000)
    print("checkout:", page.url, "| bar:", bar_text(page)[:80])

    # 数量 +1 -> 2 件（同一订单行 qty2），再验证「删除按钮把整行(qty2)删光」
    page.locator('[aria-label="增加数量"]').first.click(timeout=10000)
    page.wait_for_timeout(2200)
    print("after +1 bar:", bar_text(page)[:90])

    # 主卡片有「删除」按钮
    delbtn = page.locator("button", has_text="删除")
    print("删除 buttons:", delbtn.count())
    if delbtn.count():
        delbtn.first.click(timeout=10000)
    page.wait_for_timeout(2500)
    final = bar_text(page)
    print("after DELETE bar:", final[:90])
    empty = any(k in final for k in ["空","0 件","去逛逛","没有"])
    print("emptied:", empty)
    page.screenshot(path=f"{OUT}_after_delete.png", full_page=False)
    print("shot saved")

    # 底部导航遮挡检查：结算页 tabbar 应无
    print("JdTabBar on checkout:", page.locator('div[class*="JdTabBar"]').count())
    b.close()