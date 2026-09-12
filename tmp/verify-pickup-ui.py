# -*- coding: utf-8 -*-
"""nshop 自提点修复手机视口(390x844, dpr=2)验证：
1) profile-1 商品下单 → 自提箱仅显示「国信南山温泉酒店」，无切换按钮，名称/地图图标可点开导航
2) mock orderBoxes 返回 2 个自提点 → 「选择自提点」切换按钮出现，点开可切换
前置：本地 nuxt dev server (localhost:8080)，后端为 www.youshop.cn shop-api（已部署可见性修复）。
"""
import json, re, urllib.parse
from playwright.sync_api import sync_playwright

DOMAIN = "http://localhost:8080"
OUT = r"d:\zhao\nshop\tmp-shots"
PROFILE1_PRODUCT = "/product/%E6%B8%A9%E6%B3%89%E9%97%A8%E7%A5%A8"  # 温泉门票 (product 59, variant 57)

def add_cart(pg):
    pg.goto(DOMAIN + PROFILE1_PRODUCT, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2500)
    for label in ["加入购物车", "立即购买"]:
        try:
            pg.get_by_text(label, exact=True).first.click(timeout=4000)
            pg.wait_for_timeout(2500)
            return
        except Exception:
            continue
    raise RuntimeError("未找到立即购买/加购按钮")

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

        # ===== 场景1：单自提点（真实后端）=====
        print("== 场景1: 档案1 商品下单 ==")
        add_cart(page)
        page.goto(DOMAIN + "/checkout", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(3000)

        body = page.inner_text("body")
        assert "国信南山温泉酒店" in body, f"未见国信南山温泉酒店, body片段: {body[:300]}"
        assert "自由大路" not in body, "错误：自由大路店仍出现"
        # 单点 → 不应出现「选择自提点」切换按钮
        switch = page.get_by_text("选择自提点", exact=True)
        assert switch.count() == 0, "单自提点却出现了切换按钮"
        print("  断言1 OK: 仅显示国信南山温泉酒店，无切换按钮")
        shot(page, "checkout-pickup-single")

        # 点击自提点名称 → 打开导航弹层
        name_el = page.get_by_text("国信南山温泉酒店", exact=True).first
        name_el.click()
        page.wait_for_timeout(2500)
        shot(page, "checkout-pickup-nav-modal")
        # 关闭弹层
        page.keyboard.press("Escape")
        page.wait_for_timeout(800)

        # ===== 场景2：mock 双自提点 → 切换按钮 =====
        print("== 场景2: mock 双自提点 ==")
        page2 = ctx.new_page()
        page2.on("pageerror", lambda e: errors.append(str(e)))

        def route_boxes(route):
            req = route.request
            if req.url.endswith("/shop-api") or "/shop-api" in req.url:
                try:
                    data = req.post_data_json or {}
                    q = data.get("query") or ""
                    if "orderBoxes" in q:
                        body = {
                            "data": {
                                "orderBoxes": [
                                    {
                                        "boxKey": "box:1",
                                        "profileId": "1",
                                        "profileName": "门店自提配送档案",
                                        "lineIds": ["1"],
                                        "tenantChannelId": "1",
                                        "shippingProfileIds": ["1"],
                                        "availableShippingMethodIds": ["1"],
                                        "availableShippingMethods": [
                                            {"id": "1", "code": "store-pickup", "name": "门店自提"}
                                        ],
                                        "defaultShippingMethodId": "1",
                                        "requiresAddress": False,
                                        "requiresContact": True,
                                        "type": "pickup",
                                        "availablePaymentMethodCodes": ["offline"],
                                        "loginRequiredPaymentCodes": [],
                                        "pickupLocations": [
                                            {
                                                "id": "1", "name": "自由大路店", "type": "store",
                                                "address": "自由大路",
                                                "phoneNumber": "", "businessHours": "",
                                                "coordinates": '{"lat":43.8356,"lng":125.3335}',
                                            },
                                            {
                                                "id": "13", "name": "国信南山温泉酒店", "type": "store",
                                                "address": "吉林省长春市双阳区奢岭街道国信南山酒店",
                                                "phoneNumber": "", "businessHours": "",
                                                "coordinates": '{"lat":43.685789,"lng":125.52904}',
                                            },
                                        ],
                                        "tenantName": "默认商城",
                                        "lines": [
                                            {
                                                "orderLineId": "1", "productVariantId": "57",
                                                "productName": "温泉门票", "unitPrice": 20000,
                                                "quantity": 1, "lineTotal": 20000,
                                                "featureAssetSource": None, "variantName": None, "sku": "P1788779821524",
                                            }
                                        ],
                                        "availableCoupons": [],
                                        "shippingCost": 0, "shippingDiscount": 0, "subtotal": 20000,
                                    }
                                ]
                            }
                        }
                        return route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
                except Exception:
                    pass
            return route.continue_()

        page2.route("**/*", route_boxes)
        add_cart(page2)
        page2.goto(DOMAIN + "/checkout", wait_until="networkidle", timeout=60000)
        page2.wait_for_timeout(3000)

        switch2 = page2.get_by_text("选择自提点", exact=True)
        assert switch2.count() >= 1, "多自提点未出现切换按钮"
        print("  断言2 OK: 双自提点出现「选择自提点」按钮")
        shot(page2, "checkout-pickup-multi-switch")

        switch2.first.click()
        page2.wait_for_timeout(1200)
        body2 = page2.inner_text("body")
        assert "自由大路店" in body2 and "国信南山温泉酒店" in body2, "展开选择器后未同时列出两个自提点"
        print("  断言3 OK: 切换选择器展开，列出两个自提点")
        shot(page2, "checkout-pickup-multi-picker")

        # 切换选择 → 选中另一个点
        radio = page2.locator('input[type="radio"]').nth(1)
        radio.check(force=True)
        page2.wait_for_timeout(1500)
        shot(page2, "checkout-pickup-multi-switched")

        browser.close()

        if errors:
            print("PAGE ERRORS:", errors[:5])
        else:
            print("NO PAGE ERRORS")
        print("DONE")

if __name__ == "__main__":
    main()
