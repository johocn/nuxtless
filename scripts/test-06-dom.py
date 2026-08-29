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

    # 定位配送方式块的容器并 dump 可交互元素
    panel = page.get_by_text("配送方式", exact=True).first
    # 向上找包含 自提点 的容器
    box = page.locator("div").filter(has_text="该组物流配送方式").nth(0)
    print("=== interactive elements inside delivery box ===")
    els = box.locator("button, label, [role=radio], [role=button], input[type=radio], li, [class*=option]").evaluate_all(
        "els => els.map((e,i)=>({i, tag:e.tagName, role:e.getAttribute('role'), cls:e.className.slice(0,40), text:(e.innerText||'').trim().slice(0,40), checked:e.checked}))"
    )
    for e in els:
        print(e)

    page.screenshot(path="shots/12_delivery_box.png", full_page=False)
    browser.close()