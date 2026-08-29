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

    # dump 地址块内除隐藏input外的可点击元素
    section = page.locator("section[aria-labelledby=address-block-heading]")
    print("=== clickable-ish inside address block ===")
    els = section.locator("button, [class*=select], [class*=dropdown], [class*=cascader], [role=listbox], [role=combobox], label").evaluate_all(
        "els => els.map(e=>({i:0, tag:e.tagName, role:e.getAttribute('role'), cls:e.className.slice(0,60), text:(e.innerText||'').trim().slice(0,30)}))"
    )
    seen=set()
    for e in els:
        k=(e['cls'],e['text'])
        if k in seen: continue
        seen.add(k)
        print(e)
    print("\n=== address section text ===")
    print(section.inner_text()[:1200])
    # 截图
    page.screenshot(path="shots/14_address_block.png", full_page=False)
    browser.close()