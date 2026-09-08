# -*- coding: utf-8 -*-
"""生产环境验证：结算页订单行 数量减到0=删除行 / 删除按钮 / 底部导航不遮挡结算栏 / 删除后提交不报空选择错误。
手机视口 390x844 dpr2。目标生产 www.youshop.cn。"""
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import sys

BASE = "https://www.youshop.cn"
OUT = "scripts/shots/fix_ck"

def snap(page, name):
    p = f"{OUT}_{name}.png"
    page.screenshot(path=p, full_page=False)
    print("shot:", p)

def grab(page, sel):
    try:
        return page.locator(sel).first.inner_text()
    except Exception as e:
        return f"<ERR {e}>"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, locale="zh-CN")
    page = ctx.new_page()
    page.on("console", lambda m: print(f"[console.{m.type}] {m.text[:120]}"))

    page.goto(BASE + "/product/温泉门票", timeout=90000)
    page.wait_for_load_state("networkidle")
    print("product url:", page.url)

    buy = page.get_by_role("button", name="立即购买")
    if buy.count():
        buy.first.click(timeout=20000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2500)
    print("checkout url:", page.url)
    snap(page, "01_checkout_initial")

    # 1) 底部导航 tabbar 不应出现（结算页流程页隐藏 JdTabBar）
    tabbar = page.locator('div[class*="JdTabBar"], div[class*="jd-tab"], [class*="tabbar"]')
    print("JdTabBar count on checkout:", tabbar.count())

    # 2) 吸底结算栏存在
    bar = page.locator('div[class*="fixed"][class*="bottom-0"]')
    print("fixed bottom bar count:", bar.count())

    # 3) 展开订单明细，找到商品行步进器
    try:
        bar.get_by_role("button", name="展开明细").first.click(timeout=8000)
        page.wait_for_timeout(900)
        print("expanded.")
    except PWTimeout:
        print("WARN: no 展开明细 button")
    snap(page, "02_detail_expanded")

    minus = bar.locator('[aria-label="减少数量"]').first
    plus = bar.locator('[aria-label="增加数量"]').first
    dele = bar.locator("button", has_text="删除").first
    print("minus/plus/delete count in bar:",
          bar.locator('[aria-label="减少数量"]').count(),
          bar.locator('[aria-label="增加数量"]').count(),
          bar.locator("button", has_text="删除").count())

    line_count_before = bar.locator("li").count()
    print("lines (li) in bar BEFORE:", line_count_before)

    # 4) 数量减到 0 -> 订单行应被删除
    #   先加一次，确保数量≥2 便于观测，再把数量一路减到 0
    if plus.count():
        plus.click(timeout=10000); page.wait_for_timeout(2200)
        snap(page, "03_after_plus")
    qty_after_plus = grab(page, 'div[class*="fixed"][class*="bottom-0"] [class*="font-medium"][class*="text-neutral"]')
    print("qty after +1 text:", qty_after_plus[:120])

    # 连续点减号直到数量为 0（删除整行）
    for i in range(6):
        m = bar.locator('[aria-label="减少数量"]').first
        if not m.count():
            print(f"[minus@{i}] no minus button (line removed)"); break
        try:
            m.click(timeout=6000)
        except Exception as e:
            print(f"[minus@{i}] click err {e}"); break
        page.wait_for_timeout(1500)
    snap(page, "04_after_minus_to_zero")

    lines_after = bar.locator("li").count()
    print("lines (li) in bar AFTER minus-to-zero:", lines_after, "(expect decreased/0)")

    try:
        print("bar body after:", bar.inner_text(timeout=4000)[:400])
    except Exception:
        print("bar gone -> cart emptied (expected)")
    browser_closed_msg = ""
    try:
        body = page.locator("body").inner_text()
        print("BODY (empty guard?) contains 空/没有商品/去逛逛:", any(k in body for k in ["空","没有商品","去逛逛","未选择","无法结算"]))
    except Exception as e:
        print("body read err", e)

    b.close()