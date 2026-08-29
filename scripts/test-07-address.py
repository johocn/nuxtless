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

    # 打开新增地址表单
    page.get_by_role("button", name="新增地址").first.click()
    page.wait_for_timeout(1200)
    page.screenshot(path="shots/13_address_form.png", full_page=False)
    print("=== ADDRESS FORM TEXT ===")
    print(page.locator("body").inner_text()[:1600])

    # 打印表单字段
    print("\n=== INPUTS ===")
    inputs = page.locator("input, select").evaluate_all(
        "els => els.map(e=>({tag:e.tagName, name:e.name||e.placeholder||'', ph:e.placeholder||'', type:e.type||''}))"
    )
    for i in inputs[:30]:
        print(i)
    browser.close()