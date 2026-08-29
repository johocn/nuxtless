from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    page = ctx.new_page()
    page.on("console", lambda m: print(f"[console.{m.type}] {m.text}"))
    page.goto("https://www.youshop.cn/product/bluetooth-earbuds-pro", timeout=60000)
    page.wait_for_load_state("networkidle")
    # 立即购买
    if page.get_by_role("button", name="立即购买").count():
        page.get_by_role("button", name="立即购买").first.click()
        page.wait_for_timeout(2500)
    print("=== URL after buy now:", page.url)
    page.wait_for_load_state("networkidle")
    page.screenshot(path="shots/04_checkout.png", full_page=False)
    print(page.locator("body").inner_text()[:2000])
    browser.close()