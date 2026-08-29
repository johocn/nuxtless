from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    page = ctx.new_page()
    page.on("console", lambda m: print(f"[console.{m.type}] {m.text}"))
    page.goto("https://www.youshop.cn/product/bluetooth-earbuds-pro", timeout=60000)
    page.wait_for_load_state("networkidle")
    # 加入购物车
    page.get_by_role("button", name="加入购物车").first.click()
    page.wait_for_timeout(1500)
    # 打开购物车
    page.goto("https://www.youshop.cn/cart", timeout=60000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    page.screenshot(path="shots/03_cart.png", full_page=False)
    print("=== CART URL:", page.url)
    print(page.locator("body").inner_text()[:1200])
    browser.close()