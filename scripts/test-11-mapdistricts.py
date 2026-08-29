from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    page = ctx.new_page()
    # 捕获 graphql 请求
    reqs = []
    page.on("response", lambda r: reqs.append((r.url, r.status)))
    page.on("console", lambda m: print(f"[console.{m.type}] {m.text}"))
    page.goto("https://www.youshop.cn/product/bluetooth-earbuds-pro", timeout=60000)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="立即购买").first.click()
    page.wait_for_timeout(2500)
    page.get_by_role("button", name="新增地址").first.click()
    page.wait_for_timeout(1200)
    page.fill("input[name=fullName]", "张三")
    page.fill("input[name=phoneNumber]", "13800138000")
    section = page.locator("section[aria-labelledby=address-block-heading]")
    section.locator("button.group.rounded-md").nth(1).click()
    page.wait_for_timeout(2000)
    print("\n=== URL / status ===")
    for u, s in reqs:
        if "api" in u or "shop-api" in u:
            print(s, u[:140])
    # 再打印 body 后半段
    t = page.locator("body").inner_text()
    i = t.find("省份")
    print("\n=== around 省份 ===")
    print(t[i:i+400])
    browser.close()