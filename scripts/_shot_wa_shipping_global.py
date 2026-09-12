# -*- coding: utf-8 -*-
"""配送档案「全局化」线上手机视口截图采集（web-admin e.joho.cn/guanli）。
视口铁律: 390x844, dpr=2, is_mobile, has_touch, locale=zh-CN。
用真实 UI 登录（超管 superadmin/z123123 → 选 t2；非超管 sglobt2/z123123 → 自动进 t2），
使 auth.loadAccess() 正确判定 isSuperAdmin / 租户角色。
"""
import json, os, re
from playwright.sync_api import sync_playwright

WA = "https://e.joho.cn/guanli"
PROFILE_PAGE = WA + "/#/pages/shipping/profile/index"
OUT = r"d:\zhao\nshop\docs\superpowers\manual\shipping-profile-global\assets"

def shot(page, name, wait=900):
    page.wait_for_timeout(wait)
    path = os.path.join(OUT, name + ".png")
    page.screenshot(path=path, full_page=False)
    print("[SHOT]", path)
    return path

def new_ctx(browser):
    return browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                               is_mobile=True, has_touch=True, locale="zh-CN")

def ui_login_and_enter(browser, user, pw, want_t2=True, superRole=False):
    """UI 登录 -> (超管选 t2) -> 进入配送档案列表页。返回 page。"""
    ctx = new_ctx(browser)
    pg = ctx.new_page()
    pg.goto(WA + "/#/pages/login/index", wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(1500)
    pg.locator("input.uni-input-input").nth(0).fill(user)
    pg.locator("input.uni-input-input").nth(1).fill(pw)
    pg.get_by_text("登 录", exact=True).click()
    pg.wait_for_timeout(4000)
    body = pg.inner_text("body")
    if "选择要经营的店铺" in body:
        if superRole and want_t2:
            pg.locator(".item", has=pg.locator(".code", has_text=re.compile(r"^t2$"))).first.click()
        else:
            pg.locator(".item").first.click()
        pg.wait_for_timeout(3500)
    pg.goto(PROFILE_PAGE, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2500)
    return ctx, pg

def global_card(pg):
    cards = pg.locator(".card")
    for i in range(cards.count()):
        if cards.nth(i).locator(".global-badge").count() > 0:
            return cards.nth(i)
    return None

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)

        # ===== 超管：新建档案「设为全局」=ON + 互斥提示 =====
        su_ctx, sup = ui_login_and_enter(b, "superadmin", "z123123", want_t2=True, superRole=True)
        sup.get_by_text("＋ 新建配送档案").click()
        sup.wait_for_timeout(1300)
        # 点开「设为全局」开关（所在 field.row 含该文案 + uni-switch）
        grow = sup.locator("uni-view.field.row", has_text="设为全局").first
        gswitch = grow.locator("uni-switch")
        gswitch.wait_for(state="visible", timeout=8000)
        gswitch.locator(".uni-switch-wrapper").click()
        sup.wait_for_timeout(700)
        # 确认弹窗（uni-modal 主按钮「确定」）
        if grow.page.locator(".uni-modal__btn_primary").count():
            grow.page.locator(".uni-modal__btn_primary").click()
            grow.page.wait_for_timeout(900)
        shot(sup, "wa_profile_create_global", 700)
        su_ctx.close()

        # ===== 超管：编辑全局档案开关 + 超管列表 =====
        su2, sp2 = ui_login_and_enter(b, "superadmin", "z123123", want_t2=True, superRole=True)
        g = global_card(sp2)
        if not g:
            print("!! 超管列表未见全局卡片; body:", sp2.inner_text("body")[:500])
        else:
            g.get_by_text("编辑", exact=True).click()
            sp2.wait_for_timeout(1500)
            shot(sp2, "wa_profile_edit_global_toggle", 600)
            sp2.get_by_text("取消", exact=True).click()
            sp2.wait_for_timeout(1300)
            shot(sp2, "wa_profile_list_global_super", 700)
        su2.close()

        # ===== 非超管（默认渠道租户管理员，含配送档案只读权限）列表 =====
        tu, tp = ui_login_and_enter(b, "sglobdef", "z123123", want_t2=True, superRole=False)
        shot(tp, "wa_profile_list_global_tenant", 900)
        print("tenant body:", tp.inner_text("body")[:800].replace("\n", " | "))
        tu.close()

        b.close()
    print("ALL DONE")

if __name__ == "__main__":
    main()