# -*- coding: utf-8 -*-
"""T8 Step3 商品72 图片保存回归（管理端 UI → 保存 → API 断言 → C 端 9 图）
流程：登录 web-admin（superadmin/z123123）→ 选 t2 店铺 → 打开商品72编辑页
→ 媒体库选图到 9 张 → 确定 → 保存 → API 断言 assets=9 → C 端 t2 详情页画廊断言 9/9
"""
import json
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

WA = "https://e.joho.cn/guanli"
EDIT_URL = WA + "/#/pages/product/edit/index?id=72"
C_DOMAIN = "https://www.youshop.cn"
OUT = r"d:\zhao\nshop\tmp-shots"

ADMIN_API = "https://e.joho.cn/admin-api"
sys.path.insert(0, r"d:\zhao\vshop\docs\demo\playwright")
from login_util import admin_login_state, _admin_gql, _admin_gql_ch

def gql(q, variables=None, extra_headers=None):
    body = json.dumps({"query": q, "variables": variables or {}}).encode()
    headers = {"Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(C_DOMAIN + "/shop-api", data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def admin_state():
    st = admin_login_state("superadmin", "z123123", channel_code="t2")
    return st

def main():
    st = admin_state()
    auth = st["auth_token"]
    t2_token = st["channel_token"]
    print("channel:", st["channel_code"], st["channel_id"])

    # ---- 保存前基线 ----
    d0 = _admin_gql_ch(auth, t2_token, """query($id:ID!){ product(id:$id){ id featuredAsset{ id } assets{ id } } }""", {"id": "72"})
    p0 = d0["product"]
    print("BEFORE: featured=%s assets=%s" % ((p0.get("featuredAsset") or {}).get("id"), [a["id"] for a in p0.get("assets") or []]))

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True, locale="zh-CN")
        pg = ctx.new_page()
        # ---- 1) 登录 ----
        pg.goto(WA + "/#/pages/login/index", wait_until="domcontentloaded", timeout=90000)
        pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(1500)
        inputs = pg.locator("input.uni-input-input")
        print("login inputs:", inputs.count())
        inputs.nth(0).fill("superadmin")
        inputs.nth(1).fill("z123123")
        pg.get_by_text("登 录", exact=True).click()
        pg.wait_for_timeout(4000)
        body = pg.inner_text("body")
        print("after login:", body[:200].replace("\n", " | "))
        if "选择要经营的店铺" in body:
            import re
            item = pg.locator(".item", has=pg.locator(".code", has_text=re.compile(r"^t2$")))
            print("store item count:", item.count())
            if item.count():
                item.first.scroll_into_view_if_needed()
                item.first.click()
                pg.wait_for_timeout(3500)
        # ---- 2) 打开商品72编辑页 ----
        pg.goto(EDIT_URL, wait_until="networkidle", timeout=90000)
        pg.wait_for_timeout(3000)
        body = pg.inner_text("body")
        print("edit page loaded:", "加载中" not in body, "| 商品名:", "ok" in body)

        # ---- 3) 打开媒体库（限定可见弹层：页面含图片/视频/富文本三个 MediaLibraryModal 实例） ----
        add = pg.get_by_text("添加图片", exact=True)
        print("add btn count:", add.count())
        add.first.click()
        pg.wait_for_timeout(2500)
        overlay = pg.locator(".mlm__overlay:visible")
        overlay.wait_for(state="visible", timeout=10000)
        picked = overlay.locator(".mlm__picked")
        print("modal picked:", picked.inner_text())
        cells = overlay.locator(".mlm__cell")
        print("modal cells:", cells.count())

        # ---- 4) 选到 9 张（保留已选 42，点未选中格） ----
        def sel_count():
            t = picked.inner_text() if picked.count() else ""
            m = __import__("re").match(r"已选 (\d+)/9", t)
            return int(m.group(1)) if m else 0

        # 拦截 admin-api 请求：打印商品/资产相关 mutation 载荷
        captured = []
        def on_request(req):
            if "admin-api" in req.url and req.method == "POST":
                try:
                    b = req.post_data or ""
                    if any(k in b for k in ("updateProduct", "assignAssets", "UpdateProductAssets")):
                        captured.append((req.url.split("/")[-1][:60], b[:2000]))
                except Exception:
                    pass
        pg.on("request", on_request)

        n = sel_count()
        guard = 0
        while n < 9 and guard < 60:
            guard += 1
            clicked = False
            for i in range(cells.count()):
                cell = cells.nth(i)
                if "on" not in (cell.get_attribute("class") or ""):
                    try:
                        cell.click()
                    except Exception as e:
                        print("click err at", i, e)
                    pg.wait_for_timeout(400)
                    n = sel_count()
                    clicked = True
                    break
            if not clicked:
                break
        print("selected count:", n)
        assert n == 9, "未能选满 9 张"

        # ---- 5) 确定 → 保存 ----
        overlay.locator(".mlm__confirm", has_text="确定").click()
        pg.wait_for_timeout(2000)
        form_txt = pg.inner_text("body")
        print("已关联 9 张:", "已关联 9 张" in form_txt)
        # 保存按钮（页面底部 .save，uni-app H5 编译为 uni-button）
        save = pg.locator(".save", has_text="保存")
        print("save btn count:", save.count())
        save.first.scroll_into_view_if_needed()
        save.first.click()
        pg.wait_for_timeout(6000)
        body = pg.inner_text("body")
        print("toast 已保存:", "已保存" in body)
        for u, pl in captured:
            print("CAPTURED:", u)
            print("  ", pl.replace("\n", " ")[:900])
        pg.screenshot(path=f"{OUT}/verify-followups-product72-saved.png", full_page=False)
        ctx.close(); b.close()
        b = None

    # ---- 6) API 断言 ----
    d1 = _admin_gql_ch(auth, t2_token, """query($id:ID!){ product(id:$id){ id featuredAsset{ id } assets{ id } } }""", {"id": "72"})
    p1 = d1["product"]
    ids = [a["id"] for a in p1.get("assets") or []]
    print("AFTER: featured=%s assets=%s (%d)" % ((p1.get("featuredAsset") or {}).get("id"), ids, len(ids)))
    assert len(ids) == 9, f"保存后 assets 应为 9，实际 {len(ids)}"

    # ---- 7) C 端 t2 详情页画廊 ----
    dg = gql("""query($slug:String!){
      product(slug:$slug){ id name assets{ id } featuredAsset{ id } } }""",
      {"slug": "ok"}, {"vendure-channel-token": t2_token})
    pc = dg.get("data", {}).get("product") or {}
    c_assets = len(pc.get("assets") or [])
    print("C-side assets:", c_assets, "featured:", (pc.get("featuredAsset") or {}).get("id"))
    assert c_assets == 9, f"C 端商品 assets 应为 9，实际 {c_assets}"
    print("P72_SAVE_REGRESSION_PASSED")

if __name__ == "__main__":
    main()
