import time
from playwright.sync_api import sync_playwright

OUT = r"d:\zhao\nshop\scripts\shots"
BASE = "https://e.joho.cn/guanli"

def snap(page, name):
    page.screenshot(path=f"{OUT}\\{name}.png"); print("saved", name)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle"); time.sleep(2)
    page.locator("input").nth(0).fill("jiang")
    page.locator("input").nth(1).fill("z123123")
    time.sleep(0.5)
    page.get_by_text("登 录").first.click()
    time.sleep(3); page.wait_for_load_state("networkidle")

    # 支付档案页 + 新建
    page.goto(BASE + "/#/pages/payment/profile/index", wait_until="networkidle")
    time.sleep(2.5)
    snap(page, "wa_profile_list")
    page.get_by_text("新建支付档案").first.click()
    time.sleep(1.2)
    inputs = page.locator("input")
    print("panel inputs:", inputs.count())
    inputs.nth(0).fill("中文名验证档案")
    inputs.nth(1).fill("wechat-verify")
    time.sleep(0.3)
    snap(page, "wa_profile_createpanel")
    # 添加支付方式
    page.get_by_text("添加支付方式").first.click()
    time.sleep(1.2)
    snap(page, "wa_profile_methodsheet")
    print("sheet clicked")
    # 提取 actionSheet 文本
    body = page.evaluate("document.body.innerText")
    print("=== add-method sheet 文本 ===")
    print(body[-500:])
    b.close()