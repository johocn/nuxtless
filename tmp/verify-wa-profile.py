# -*- coding: utf-8 -*-
"""运营后台(web-admin H5)手机视口(390x844, dpr=2)验证：
配送档案 → 编辑「门店自提配送档案」→ 自提点分组应显示 自由大路店 + 国信南山温泉酒店（均勾选）。
"""
from playwright.sync_api import sync_playwright

DOMAIN = "https://e.joho.cn/guanli"
OUT = r"d:\zhao\nshop\tmp-shots"
USER = "superadmin"
PWD = "z123123"

def shot(pg, name, wait=1500):
    pg.wait_for_timeout(wait)
    path = f"{OUT}\\{name}.png"
    pg.screenshot(path=path, full_page=False)
    print("SHOT", path)
    return path

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            locale="zh-CN",
        )
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: print("[console]", m.text[:120]) if m.type == "error" else None)

        # ===== 登录 =====
        page.goto(f"{DOMAIN}/#/pages/login/index", wait_until="domcontentloaded", timeout=60000)
        page.locator("input.uni-input-input").first.wait_for(timeout=30000)
        page.wait_for_timeout(1000)
        page.locator("input.uni-input-input").first.fill(USER)
        page.locator("input.uni-input-input").nth(1).fill(PWD)
        page.get_by_text("登 录", exact=True).click()
        page.wait_for_timeout(3500)
        url = page.url
        print("登录后 URL:", url)
        body = page.inner_text("body")
        if "选择要经营的店铺" in body:
            # 选默认渠道（第一个通常是默认商城）
            items = page.locator(".item")
            print("店铺列表:", items.count())
            items.first.click()
            page.wait_for_timeout(3000)
            print("选店后 URL:", page.url)
        shot(page, "wa-dashboard", 1500)

        # ===== 配送档案页 =====
        page.goto(f"{DOMAIN}/#/pages/shipping/profile/index", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2500)
        body = page.inner_text("body")
        assert "门店自提配送档案" in body, f"未见门店自提配送档案: {body[:400]}"
        shot(page, "wa-profile-list", 1200)

        # ===== 编辑门店自提配送档案 =====
        card = page.locator(".card", has_text="门店自提配送档案").first
        card.get_by_text("编辑", exact=True).click()
        page.wait_for_timeout(2500)
        body = page.inner_text("body")
        print("编辑面板 body 片段:", body[:600])
        shot(page, "wa-profile-store-pickup-edit", 1500)

        browser.close()
        if errors:
            print("PAGE ERRORS:", errors[:5])
        else:
            print("NO PAGE ERRORS")
        print("DONE")

if __name__ == "__main__":
    main()
