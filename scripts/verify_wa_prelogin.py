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
    # 直接进登录页，强制走登录
    page.goto(BASE, wait_until="networkidle"); time.sleep(2)
    page.wait_for_load_state("networkidle")
    snap(page, "wa_prelogin")
    content = page.content()
    print("has 登录:", "登录" in content, "| inputs:", page.locator("input").count())
    print("INPUT placeholders:", page.locator("input").evaluate_all("els => els.map(e => e.placeholder || e.type)"))
    b.close()