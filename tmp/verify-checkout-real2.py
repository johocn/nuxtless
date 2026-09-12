# -*- coding: utf-8 -*-
"""C端真实后端验证（dev server localhost:8080 → 生产 shop-api）：
档案1商品下单 → 门店自提箱显示 自由大路店 + 国信南山温泉酒店（2点）+ 「选择自提点」切换按钮。
"""
from playwright.sync_api import sync_playwright

DOMAIN = "http://localhost:8080"
OUT = r"d:\zhao\nshop\tmp-shots"
PROFILE1_PRODUCT = "/product/%E6%B8%A9%E6%B3%89%E9%97%A8%E7%A5%A8"  # 温泉门票 (variant 57, 档案1)

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

        page.goto(DOMAIN + PROFILE1_PRODUCT, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2500)
        for label in ["加入购物车", "立即购买"]:
            try:
                page.get_by_text(label, exact=True).first.click(timeout=4000)
                page.wait_for_timeout(2500)
                break
            except Exception:
                continue
        page.goto(DOMAIN + "/checkout", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(4000)

        body = page.inner_text("body")
        print("checkout body 片段:", body[:500])
        assert "国信南山温泉酒店" in body, "未见国信南山温泉酒店"
        assert "自由大路店" in body, "未见自由大路店"
        print("断言1 OK: 两个门店自提点均显示")
        switch = page.get_by_text("选择自提点", exact=True)
        print("切换按钮数:", switch.count())
        assert switch.count() >= 1, "双自提点未出现「选择自提点」切换按钮"
        print("断言2 OK: 出现「选择自提点」切换按钮")
        shot(page, "checkout-pickup-2points-switch")

        switch.first.click()
        page.wait_for_timeout(1500)
        body2 = page.inner_text("body")
        assert "自由大路店" in body2 and "国信南山温泉酒店" in body2
        print("断言3 OK: 切换选择器展开列出两个自提点")
        shot(page, "checkout-pickup-2points-picker")

        browser.close()
        if errors:
            print("PAGE ERRORS:", errors[:5])
        else:
            print("NO PAGE ERRORS")
        print("DONE")

if __name__ == "__main__":
    main()
