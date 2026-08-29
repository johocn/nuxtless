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

    # 填写收货人 + 电话
    page.fill("input[name=fullName]", "张三")
    page.fill("input[name=phoneNumber]", "13800138000")

    # 点击省份输入框，看是否弹出中国省下拉
    page.locator("input[name=province]").click()
    page.wait_for_timeout(1500)
    page.screenshot(path="shots/14_province_dropdown.png", full_page=False)
    print("=== PROVINCE dropdown options ===")
    opts = page.locator("li, [role=option], .options > *").evaluate_all("els => els.map(e=>(e.innerText||'').trim()).filter(Boolean).slice(0,20)")
    print(opts[:20])
    print(page.locator("body").inner_text()[:1400])
    browser.close()