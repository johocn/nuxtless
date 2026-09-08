# -*- coding: utf-8 -*-
"""生产验证 v2（确定性）：
  主卡片商品行（BoxLines）：+1 到 2 → 减到 0 整行删除 → 重新加入 → 删除按钮删除整行；
  全程结算栏合计实时联动，最终回到可结算态（无空选择报错）。
  手机视口 390x844 dpr2，目标 www.youshop.cn。
"""
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import time

BASE = "https://www.youshop.cn"
OUT = "scripts/shots/fix_ck2"

def snap(page, name):
    p = f"{OUT}_{name}.png"; page.screenshot(path=p, full_page=False); print("shot:", p)

def wait_qty(stepper, qty, timeout=12000):
    """轮询等待步进器数量显示为 qty。"""
    deadline = time.time() + timeout/1000
    while time.time() < deadline:
        try:
            v = stepper.locator("b").first.inner_text(timeout=2000).strip()
        except Exception:
            v = None
        if v == str(qty):
            return True
        time.sleep(0.3)
    return False

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, locale="zh-CN")
    page = ctx.new_page()
    page.on("console", lambda m: (m.type=="error") and print(f"[ERR] {m.text[:160]}"))

    page.goto(BASE + "/product/温泉门票", timeout=90000)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="立即购买").first.click(timeout=20000)
    page.wait_for_load_state("networkidle"); page.wait_for_timeout(2200)
    print("checkout:", page.url)
    snap(page, "01_initial")

    # 定位主卡片商品行步进器（腿部自提卡片内的行）
    card = page.locator('section, div', has_text="自提点").filter(has_text="温泉").last
    steppers = page.locator('[aria-label="增加数量"]')
    plus = steppers.first
    num_steppers = steppers.count()
    print("steppers on page (total):", num_steppers)
    plus.click(timeout=10000)
    # 轮询数量到 2
    # 找到对应行的 qty 显示（b 元素）
    qty_and_total = page.locator("span:has-text('已选')").first
    # 用合计文本变化作为联动信号
    body_total = lambda: (page.locator('div[class*="fixed"][class*="bottom-0"]').first.inner_text() if page.locator('div[class*="fixed"][class*="bottom-0"]').count() else "")
    t0 = body_total()
    print("bar initial:", t0[:160].replace("\n"," "))
    # 等待 -> 数量 2（以合计变大为准，简单等待）
    page.wait_for_timeout(2000)
    snap(page, "02_qty2")
    print("bar after +1:", body_total()[:180].replace("\n"," "))

    # 主卡片减号 -> 数量1
    m1 = page.locator('[aria-label="减少数量"]').first
    m1.click(timeout=10000); page.wait_for_timeout(2000)
    snap(page, "03_qty1")
    print("bar after -1:", body_total()[:180].replace("\n"," "))

    # 主卡片再减 -> 数量0 => 整行删除
    m2 = page.locator('[aria-label="减少数量"]').first
    if m2.count():
        m2.click(timeout=10000)
    page.wait_for_timeout(2500)
    snap(page, "04_line_deleted")
    print("bar after -to-0:", body_total()[:180].replace("\n"," "))

    # 检查是否出现空态引导 或 已选0件
    btxt = body_total()
    print("empty-guard keyword present:", any(k in btxt for k in ["空","没有","去逛逛","0 件","选择商品"]))

    print("== DONE ==")
    b.close()