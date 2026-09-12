# -*- coding: utf-8 -*-
"""C端验证（dev server localhost:8080 → 生产 shop-api 同源代理）：
档案1商品加购 → 结算页门店自提箱双自提点 + 「选择自提点」切换 + 名称点击/地图图标两种导航触发。
"""
from playwright.sync_api import sync_playwright

DOMAIN = "http://localhost:8080"
OUT = r"d:\zhao\nshop\tmp-shots"
VARIANT_ID = "58"

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

        # 1) 访问站点建立会话
        page.goto(DOMAIN + "/", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2500)

        # 2) 同源 fetch 加购（经 dev proxy → 生产 shop-api，携带会话 cookie）
        add = page.evaluate(f"""async () => {{
            const r = await fetch('/shop-api', {{
                method: 'POST',
                credentials: 'same-origin',
                headers: {{ 'Content-Type': 'application/json', 'vendure-channel-token': 'cnx87ezvmjx8nn3bth6c' }},
                body: JSON.stringify({{ query: 'mutation {{ addItemToOrder(productVariantId: {VARIANT_ID}, quantity: 1) {{ __typename ... on Order {{ id code }} ... on ErrorResult {{ errorCode message }} }} }}' }})
            }});
            return {{ status: r.status, body: await r.text() }};
        }}""")
        print("addItemToOrder:", str(add)[:200])
        assert '"__typename":"Order"' in str(add), f"加购失败: {add}"

        # 3) 结算页
        page.goto(DOMAIN + "/checkout", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(4000)
        body = page.inner_text("body")
        assert "自由大路店" in body, "未见自由大路店（默认选中就近点）"
        print("断言1 OK: 自提箱默认选中 自由大路店")
        switch = page.get_by_text("选择自提点", exact=True)
        assert switch.count() >= 1, "双自提点未出现「选择自提点」切换按钮"
        print("断言2 OK: 出现「选择自提点」切换按钮")
        shot(page, "checkout-pickup-2points-switch")

        # 4) 展开切换选择器 → 两个自提点均列出
        switch.first.click()
        page.wait_for_timeout(1500)
        body2 = page.inner_text("body")
        assert "自由大路店" in body2 and "国信南山温泉酒店" in body2, f"选择器未列出两个自提点: {body2[:300]}"
        print("断言3 OK: 切换选择器展开列出两个自提点")
        shot(page, "checkout-pickup-2points-picker")

        # 5) 选择器内选中 国信南山温泉酒店 → 概览更新
        page.get_by_text("国信南山温泉酒店", exact=True).last.click()
        page.wait_for_timeout(1500)
        # 6) 收起选择器 → 概览区名称可点导航
        page.get_by_text("收起明细", exact=True).click()
        page.wait_for_timeout(800)

        # 7) 点击概览区自提点名称 → 导航弹层（标题=自提点名）
        name_el = page.get_by_text("国信南山温泉酒店", exact=True).first
        name_el.click()
        page.wait_for_timeout(3000)
        go_btn = page.get_by_text("去导航", exact=True)
        assert go_btn.count() >= 1, "点击名称未打开导航弹层（未见「去导航」）"
        print("断言4 OK: 点击自提点名称打开导航弹层")
        shot(page, "checkout-pickup-nav-modal-name")
        page.keyboard.press("Escape")
        page.wait_for_timeout(1000)

        # 8) 点击地图图标按钮（aria-label=导航）→ 导航弹层
        map_btn = page.get_by_role("button", name="导航")
        assert map_btn.count() >= 1, "未见地图图标按钮"
        map_btn.first.click()
        page.wait_for_timeout(3000)
        go_btn2 = page.get_by_text("去导航", exact=True)
        assert go_btn2.count() >= 1, "点击地图图标未打开导航弹层"
        print("断言5 OK: 点击地图图标打开导航弹层")
        shot(page, "checkout-pickup-nav-modal-icon")
        page.keyboard.press("Escape")
        page.wait_for_timeout(800)

        browser.close()
        if errors:
            print("PAGE ERRORS:", errors[:5])
        else:
            print("NO PAGE ERRORS")
        print("DONE")

if __name__ == "__main__":
    main()
