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
    print("after login url:", page.url)

    # 1) 支付方式页（本店方式）——用户实际吐槽位置
    page.goto(BASE + "/#/pages/payment/methods/index", wait_until="networkidle")
    time.sleep(2.5)
    snap(page, "wa_methods_final")
    body = page.evaluate("document.body.innerText")
    print("=== 支付方式页(本店) body ===")
    print(body[:700])
    b.close()