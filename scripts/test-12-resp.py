from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    page = ctx.new_page()
    hits = []
    def on_resp(r):
        try:
            if "shop-api" in r.url:
                b = None
                try:
                    b = r.json()
                except Exception:
                    pass
                if b is not None and "mapDistricts" in json.dumps(b)[:2000]:
                    hits.append(b)
        except Exception:
            pass
    page.on("response", on_resp)
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
    page.wait_for_timeout(2500)
    print("=== mapDistricts responses count:", len(hits))
    for h in hits[:3]:
        s = json.dumps(h, ensure_ascii=False)
        print(s[:600])
    browser.close()