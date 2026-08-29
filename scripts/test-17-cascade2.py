from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 960}, locale="zh-CN")
    page = ctx.new_page()
    page.on("console", lambda m: print(f"[console.{m.type}] {m.text[:100]}"))
    page.goto("https://www.youshop.cn/product/bluetooth-earbuds-pro", timeout=60000)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="立即购买").first.click()
    page.wait_for_timeout(2500)
    page.get_by_role("button", name="新增地址").first.click()
    page.wait_for_timeout(1200)
    page.fill("input[name=fullName]", "李四")
    page.fill("input[name=phoneNumber]", "13900139000")

    section = page.locator("section[aria-labelledby=address-block-heading]")
    sel = section.locator("button.group.rounded-md")

    def pick(idx, text):
        sel.nth(idx).click()
        page.wait_for_timeout(900)
        opt = page.locator("[role=option], li", has_text=text).first
        if opt.count():
            opt.click()
            page.wait_for_timeout(900)
            return True
        return False

    print("省 广东省:", pick(1, "广东省"))
    print("市 广州市:", pick(2, "广州市"))
    print("区 天河区:", pick(3, "天河区"))
    page.fill("input[name=streetLine1]", "珠江新城华夏路10号")
    page.fill("input[name=streetLine2]", "富力中心2001")
    page.fill("input[name=postalCode]", "510620")
    page.screenshot(path="shots/22_cascade_filled.png", full_page=False)
    page.get_by_role("button", name="保存收货地址").first.click()
    page.wait_for_timeout(1500)
    page.screenshot(path="shots/23_cascade_saved.png", full_page=False)
    t = page.locator("body").inner_text()
    i = t.find("配送至")
    print("=== 配送至 section ===")
    print(t[i:i+200])
    browser.close()