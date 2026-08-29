from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 960}, locale="zh-CN")
    page = ctx.new_page()
    page.on("console", lambda m: print(f"[console.{m.type}] {m.text[:120]}"))
    page.goto("https://www.youshop.cn/product/bluetooth-earbuds-pro", timeout=60000)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="立即购买").first.click()
    page.wait_for_timeout(2500)
    page.get_by_role("button", name="新增地址").first.click()
    page.wait_for_timeout(1200)
    page.fill("input[name=fullName]", "张三")
    page.fill("input[name=phoneNumber]", "13800138000")

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

    print("选省 北京市:", pick(1, "北京市"))
    print("选市 市辖区:", pick(2, "市辖区"))
    print("选区 海淀区:", pick(3, "海淀区"))
    page.screenshot(path="shots/20_geo_filled.png", full_page=False)

    # 街道选填跳过；填详细地址 + 地址2 + 邮编
    page.fill("input[name=streetLine1]", "中关村大街1号院")
    page.fill("input[name=streetLine2]", "3号楼1502")
    page.fill("input[name=postalCode]", "100080")
    # 保存
    page.get_by_role("button", name="保存收货地址").first.click()
    page.wait_for_timeout(1500)
    page.screenshot(path="shots/21_address_saved.png", full_page=False)

    print("=== after save, body snippet ===")
    t = page.locator("body").inner_text()
    print(t[:1200])
    browser.close()