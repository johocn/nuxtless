from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    page.goto("https://www.youshop.cn/product/bluetooth-earbuds-pro", timeout=60000)
    page.wait_for_load_state("networkidle")
    page.screenshot(path="shots/02_product_top.png", full_page=False)
    # 找加入购物车 / 立即购买 按钮
    btns = page.locator("button").evaluate_all("els => els.map((e,i)=>({i, text:(e.innerText||'').trim()}))")
    for b in btns:
        print("BTN:", b)
    # SKU 变体选择
    radios = page.locator("input[type=radio], [role=radio]").count()
    print("radio count:", radios)
    # 打印关键文本
    print("BODY TEXT SNIPPET:")
    print(page.locator("body").inner_text()[:1500])
    print("\n--- console ---")
    for l in logs[:30]:
        print(l)
    browser.close()