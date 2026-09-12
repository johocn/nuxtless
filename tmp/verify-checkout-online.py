# -*- coding: utf-8 -*-
"""线上验证（https://www.youshop.cn，手机视口 390x844 dpr=2）：
1) 首页/结算页可访问 2) 加购建档 3) 结算页自提箱 + 「选择自提点」切换 + 名称/地图图标导航弹层
4) 截图：返回按钮 / 自提点切换 / 导航弹层 → tmp-shots + manual assets
"""
from playwright.sync_api import sync_playwright
import shutil, os

DOMAIN = "https://www.youshop.cn"
OUT = r"d:\zhao\nshop\tmp-shots"
MANUAL = r"d:\zhao\nshop\docs\superpowers\manual\checkout-per-user-refresh-nav\assets"
VARIANT_ID = "58"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MANUAL, exist_ok=True)

def shot(pg, name, wait=1500):
    pg.wait_for_timeout(wait)
    path = f"{OUT}\\{name}.png"
    pg.screenshot(path=path, full_page=False)
    print("SHOT", path)
    return path

def copy_shot(name, manual_name):
    src = f"{OUT}\\{name}.png"
    dst = f"{MANUAL}\\{manual_name}.png"
    shutil.copy2(src, dst)
    print("COPY", dst)

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

        # 1) 首页 + 结算页可访问
        page.goto(DOMAIN + "/", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2500)
        print("首页 OK:", page.title())

        # 2) 同源 fetch 加购（线上 /shop-api 同源反代）
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
        has_pickup_name = ("自提" in body) and any(n in body for n in ["自由大路", "国信南山", "温泉酒店"])
        print("结算页文本片段:", body[:400].replace("\n", " "))
        assert "去结算" in body or "合计" in body, "结算页未渲染"
        print("断言1 OK: 结算页渲染（含合计/去结算）")
        # 返回按钮（页首左上角）
        back = page.get_by_role("button", name="返回")
        if back.count() == 0:
            back = page.get_by_text("返回", exact=True)
        assert back.count() >= 1, "未见「返回」按钮"
        print("断言2 OK: 返回按钮存在")
        shot(page, "online-checkout-top")
        copy_shot("online-checkout-top", "s1_back_button_online.png")

        # 4) 自提点切换按钮（>1 时必显）+ 就近自提点名
        switch = page.get_by_text("选择自提点", exact=True)
        if switch.count() == 0:
            # 也许只有单个自提点 → 记录现状
            print("注意: 未见「选择自提点」切换按钮，body 含自提点名:", has_pickup_name)
        else:
            switch.first.click()
            page.wait_for_timeout(1500)
            body2 = page.inner_text("body")
            print("选择器文本片段:", body2[body2.find("选择自提点"):body2.find("选择自提点")+300].replace("\n", " ") if "选择自提点" in body2 else body2[:300])
            shot(page, "online-checkout-picker")
            copy_shot("online-checkout-picker", "s2_pickup_switch_online.png")
            # 收起
            close = page.get_by_text("收起明细", exact=True)
            if close.count():
                close.click()
                page.wait_for_timeout(800)

        # 5) 导航触发：点击概览区自提点名称或地图按钮 → 导航弹层
        nav_clicked = False
        name_el = page.locator('[aria-label="导航"]').first
        if name_el.count():
            name_el.click(); nav_clicked = True
        else:
            for nm in ["国信南山", "自由大路", "温泉酒店"]:
                el = page.get_by_text(nm, exact=True).first
                if el.count():
                    el.click(); nav_clicked = True; break
        page.wait_for_timeout(3500)
        go_btn = page.get_by_text("去导航", exact=True)
        print("导航弹层「去导航」数量:", go_btn.count(), "| 触发方式:", "地图按钮" if name_el.count() else "名称点击")
        shot(page, "online-checkout-navmodal")
        copy_shot("online-checkout-navmodal", "s3_navigation_modal_online.png")
        if go_btn.count() >= 1:
            print("断言3 OK: 导航弹层打开（含去导航）")
        else:
            print("警告: 未见「去导航」，弹层可能未打开（页面错误:", errors[:3], "）")

        print("页面 JS 错误:", errors[:5] if errors else "无")
        print("VERIFY ONLINE DONE")

if __name__ == "__main__":
    main()
