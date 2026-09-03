# -*- coding: utf-8 -*-
"""验证 2026-09-03 逐箱整行粒度修复：phone viewport (390x844, dpr=2) 线上结算页。
场景：
  wl1 加购数量=2 → 结算页商品行数量只读显示 2、金额=单价x2、无 ± 步进
  wl2 取消勾选该行 → 整行不结算，应付款/已选件数即时刷新（整行粒度）
  wl3 重新勾选 → 恢复
仅到结算页展示与选择交互，不下单不支付。
"""
import json, os
from playwright.sync_api import sync_playwright

BASE = "https://www.youshop.cn"
SHOP = BASE + "/shop-api?languageCode=zh-Hans"
OUT = r"d:\zhao\nshop\scripts\shots"; os.makedirs(OUT, exist_ok=True)

# search 顶层查询取可售变体（products.includeVariants 线上 schema 不支持）
QUERY_PICK = """query S{ search(input:{take:10}){ items{ productVariantId productName priceWithTax{ ... on SinglePrice{ value } } } } }"""
ADD = """mutation Add($i:ID!,$q:Int!){ addItemToOrder(productVariantId:$i,quantity:$q){... on Order{ id totalQuantity lines{ id quantity unitPrice } } ... on ErrorResult{ errorCode message } } }"""

def pick_variant(resp):
    items = ((resp.get("data",{}) or {}).get("search",{}) or {}).get("items",[]) or []
    print("DBG variants:", str(items)[:300])
    for it in items:
        price = (it.get("priceWithTax") or {}).get("value")
        if it.get("productVariantId") and price is not None:
            return it["productVariantId"], it.get("productName"), price
    return None

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2,
                        locale="zh-CN", is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto(BASE, timeout=60000); pg.wait_for_load_state("networkidle")
    H = {"Content-Type":"application/json"}

    vq = pg.request.post(SHOP, data=json.dumps({"query":QUERY_PICK}), headers=H).json()
    found = pick_variant(vq)
    if not found:
        print("NO_PURCHASABLE_VARIANT"); b.close(); raise SystemExit(1)
    vid, vname, price = found
    print("variant:", vid, vname, "price=", price)

    # 加购数量=2（复现「购物车2」；复用浏览器匿名会话 cookie）
    add_resp = pg.request.post(SHOP, data=json.dumps({"query":ADD,"variables":{"i":str(vid),"q":2}}), headers=H)
    add_json = add_resp.json()
    line = (add_json.get("data",{}).get("addItemToOrder") or {})
    print("add session-token:", add_resp.headers.get("vendure-auth-token"))
    if line.get("errorCode"):
        print("ADD_FAIL:", json.dumps(add_json)); b.close(); raise SystemExit(1)
    print("ADD_RAW:", json.dumps(add_json)[:600])
    print("order totalQty:", line.get("totalQuantity"), "line qty:", (line.get("lines") or [{}])[-1].get("quantity"))

    pg.goto(BASE + "/checkout", timeout=90000); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(4000)

    # wl1 商品行主体（整行粒度：数量只读 ×2、金额=单价x2、无 ± 步进）
    pg.evaluate("window.scrollTo(0, 0)")
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(OUT,"wl1_checkout_wholeline.png"))

    # wl2 取消勾选商品行 → 整行不结算，应付款/件数即时刷新（整行粒度）
    cbs = pg.locator('input[type="checkbox"]')
    if cbs.count() >= 2:
        cbs.nth(1).click(); pg.wait_for_timeout(1200)
        pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        pg.wait_for_timeout(600)
        pg.screenshot(path=os.path.join(OUT,"wl2_unchecked.png"))
        # wl3 勾回
        cbs.nth(1).click(); pg.wait_for_timeout(1000)
        pg.screenshot(path=os.path.join(OUT,"wl3_rechecked.png"))

    b.close()
    print("[DONE]", OUT)