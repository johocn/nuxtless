import time
from playwright.sync_api import sync_playwright
OUT = r"d:\zhao\nshop\scripts\shots"
BASE = "https://e.joho.cn/guanli"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")
    time.sleep(2.5)
    body = page.evaluate("document.body.innerText")
    print("=== body dump ===")
    print(repr(body[:500]))
    print("URL:", page.url)
    b.close()