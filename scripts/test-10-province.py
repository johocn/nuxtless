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
    page.get_by_role("button", name="新增地址").first.click()
    page.wait_for_timeout(1000)
    page.fill("input[name=fullName]", "张三")
    page.fill("input[name=phoneNumber]", "13800138000")

    section = page.locator("section[aria-labelledby=address-block-heading]")
    # 前4个自定义select：0 China, 1 省份, 2 城市, 3 区县, 4 街道
    sel = section.locator("button.group.rounded-md")
    n = sel.count()
    print("cascade select count:", n)
    # 点击省份
    btn = sel.nth(1)
    btn.click()
    page.wait_for_timeout(1500)
    page.screenshot(path="shots/15_province_panel.png", full_page=False)
    # 面板选项
    body = page.locator("body").inner_text()
    print("=== body snippet after province click ===")
    print(body[body.find("省份"):body.find("省份")+1400] if "省份" in body else body[:800])
    browser.close()