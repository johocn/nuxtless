from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    page.goto("https://www.youshop.cn/", timeout=60000)
    page.wait_for_load_state("networkidle")
    page.screenshot(path="shots/01_home.png", full_page=False)
    print("TITLE:", page.title())
    print("URL:", page.url)
    # 找商品卡片/链接
    links = page.locator("a").evaluate_all("els => els.map(e => ({href:e.href, text:(e.innerText||'').trim()})).filter(x=>x.text)")[:60]
    for l in links[:60]:
        print("LINK:", l["href"], "|", l["text"][:50])
    print("\n--- console logs ---")
    for l in logs[:30]:
        print(l)
    browser.close()