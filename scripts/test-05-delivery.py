from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    page = ctx.new_page()
    page.on("console", lambda m: print(f"[console.{m.type}] {m.text}"))
    page.goto("https://www.youshop.cn/product/bluetooth-earbuds-pro", timeout=60000)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="立即购买").first.click()
    page.wait_for_timeout(2500)
    page.wait_for_load_state("networkidle")
    page.screenshot(path="shots/10_checkout_top.png", full_page=False)

    # 展开物流配送方式：点击“该组物流配送方式”
    for label in ["该组物流配送方式", "default默认配送档案", "配送组 1", "门店自提"]:
        el = page.get_by_text(label, exact=True).first
        try:
            if el.count():
                print(f"[click] {label}")
                el.click()
                page.wait_for_timeout(1200)
        except Exception as e:
            print(f"[skip] {label}: {e}")

        page.screenshot(path=f"shots/11_after_{label.replace(' ','')}.png", full_page=False)
        # 打印配送区域文本
        try:
            region = page.get_by_text("配送方式", exact=True).first.locator("..").locator("..")
            print(f"=== {label} region snippet ===\n", region.inner_text()[:900])
        except Exception as e:
            print("region err", e)

    browser.close()