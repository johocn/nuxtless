# -*- coding: utf-8 -*-
"""管理端核销 /admin/redemption 有效态截图归档（修复后生产烟测）。
流程:
  1) superadmin 登录取 vendure-auth-token
  2) 顾客会话构一笔自提单 -> admin 结算 -> 生成真实核销码
  3) 管理端页面注入 sessionStorage(nshop.admin.token) ->
     输入核销码触发 redemptionLookup -> 展示「待核销 + 订单摘要 + 确认核销」-> 截图
视口: 380x844, dpr2 (手机), 参照 _shot_redemption.py。
输出: d:\\zhao\\vendure\\e2e-shots\\admin-redemption-found.png
"""
import json, os, re
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright

BASE = "https://www.youshop.cn"
SHOP = BASE + "/shop-api"
ADMIN_API = "https://e.joho.cn/admin-api"
CH = "cnx87ezvmjx8nn3bth6c"
OUT = r"d:\zhao\vendure\e2e-shots"
EMAIL = "split-e2e-a@joho.cn"
PASSWORD = "Test#Split123"
VARIANT_PICKUP = 48
SHIP_METHOD = "1"
PICKUP_LOC = "1"
PICKUP_TYPE = "store"
SUPERADMIN_USER = "superadmin"
SUPERADMIN_PWDS = ["superadmin", "z123123"]  # 依 probe-admin.cjs; 回退 _shot_redemption.py

def http_json(url, q, v=None, headers=None, method="POST"):
    b = json.dumps({"query": q, "variables": v or {}}).encode()
    req = Request(url, data=b, headers={"Content-Type": "application/json", **(headers or {})}, method=method)
    try:
        with urlopen(req, timeout=40) as r:
            return (r.headers.get("vendure-auth-token") or ""), json.loads(r.read().decode())
    except HTTPError as e:
        return "", json.loads(e.read().decode())

def admin_login():
    tok = ""
    errs = []
    for pw in SUPERADMIN_PWDS:
        token, body = http_json(ADMIN_API,
            'mutation($u:String!,$p:String!){ login(username:$u,password:$p){ __typename ... on ErrorResult { message } } }',
            {"u": SUPERADMIN_USER, "p": pw})
        if token:
            tok = token; break
        errs.append((pw, json.dumps(body, ensure_ascii=False)[:200]))
    if not tok:
        raise RuntimeError("superadmin login failed: " + str(errs))
    return tok

def admin_settle(token, order_code):
    AH = {"Authorization": "Bearer " + token, "vendure-channel-token": CH}
    _, d = http_json(ADMIN_API,
        'query($c:String!){ orders(options:{filter:{code:{eq:$c}}}){ items{ id state payments{ id state } } } }',
        {"c": order_code}, AH)
    o = (d.get("data") or {}).get("orders", {}).get("items") or []
    if not o:
        raise RuntimeError("order not found in admin for " + order_code)
    for pay in o[0]["payments"]:
        if pay["state"] == "Authorized":
            http_json(ADMIN_API, 'mutation{ transitionPaymentToState(id:"%s", state:"Settled"){ ...on Payment{ state } } }' % pay["id"], headers=AH)
    return o[0]["id"]

def build_pickup_order(ctx):
    def gql(q, v=None):
        r = ctx.request.post(SHOP, data=json.dumps({"query": q, "variables": v or {}}), headers={
            "Content-Type": "application/json", "vendure-channel-token": CH})
        return json.loads(r.text())
    gql("mutation{ removeAllOrderLines{ ...on Order{ id } } }")
    gql("mutation($i:ID!){ addItemToOrder(productVariantId:$i, quantity:1){ ...on Order{ id } } }", {"i": str(VARIANT_PICKUP)})
    gql("mutation($i:[ID!]!){ setOrderShippingMethod(shippingMethodId:$i){ ...on Order{ id } } }", {"i": [SHIP_METHOD]})
    gql("mutation($i:ID!,$t:String!){ setOrderPickupLocation(pickupLocationId:$i,pickupType:$t){ ...on Order{ id } } }", {"i": PICKUP_LOC, "t": PICKUP_TYPE})
    dd = gql('mutation($m:String!){ checkoutSplitted(method:$m){ id code state } }', {"m": "cash-on-delivery"})
    arr = (dd.get("data") or {}).get("checkoutSplitted") or []
    if not arr:
        raise RuntimeError("checkout failed: " + json.dumps(dd, ensure_ascii=False)[:400])
    return arr[0]["code"]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    token = admin_login()
    print("admin token: OK")

    # ---- 顾客会话构单并结算，取真实核销码 ----
    cctx = b.new_context(viewport={"width": 380, "height": 844}, device_scale_factor=2,
                         is_mobile=True, has_touch=True, locale="zh-CN")
    cpg = cctx.new_page()
    cpg.goto(BASE + "/account/login", timeout=90000)
    cpg.wait_for_load_state("networkidle"); cpg.wait_for_timeout(2500)
    cpg.locator("input[type=email], input[name=username], input[type=text]").first.fill(EMAIL)
    cpg.locator("input[type=password]").first.fill(PASSWORD)
    cpg.get_by_role("button").filter(has_text=re.compile("登|Sign")).first.click(timeout=8000)
    cpg.wait_for_timeout(4500)
    order_code = build_pickup_order(cctx)
    admin_settle(token, order_code)
    gr = json.loads(cpg.request.post(SHOP, data=json.dumps({"query": '''query{ orderRedemptionCode(input:{orderCode:"%s"}){ redemptionCode } }''' % order_code,
              "variables": {}}), headers={"Content-Type": "application/json", "vendure-channel-token": CH}).text())
    rc = (gr.get("data") or {}).get("orderRedemptionCode", {}).get("redemptionCode") or ""
    print("built+settled order:", order_code, "code:", rc)

    # ---- 管理端有效态 ----
    actx = b.new_context(viewport={"width": 380, "height": 844}, device_scale_factor=2,
                         is_mobile=True, has_touch=True, locale="zh-CN")
    apg = actx.new_page()
    apg.goto(BASE + "/admin/redemption", timeout=90000)
    apg.wait_for_load_state("networkidle"); apg.wait_for_timeout(1500)
    apg.evaluate("(tk)=>{ sessionStorage.setItem('nshop.admin.token', tk); }", token)
    apg.reload(timeout=90000)
    apg.wait_for_load_state("networkidle"); apg.wait_for_timeout(1000)
    try:
        code_input = apg.locator("input[placeholder*=核销码]").first
        code_input.wait_for(state="visible", timeout=15000)
    except Exception as e:
        # 回退：最后一枚文本框（登录区 username/password 之外）
        print("placeholder fallback:", e)
        code_input = apg.locator("input").nth(-1)
    code_input.fill(rc)
    code_input.press("Enter")

    # 等待「待核销 + 确认核销按钮」出现
    seen = {"pending": False, "btn": False}
    for _ in range(30):
        apg.wait_for_timeout(900)
        txt = apg.inner_text("body")
        if "待核销" in txt:
            seen["pending"] = True
        if apg.get_by_role("button").filter(has_text="确认核销").count() > 0:
            seen["btn"] = True
        if seen["pending"] and seen["btn"]:
            break
    print("found-state => 待核销:", seen["pending"], "| 确认核销按钮:", seen["btn"])
    apg.wait_for_timeout(600)
    shot = os.path.join(OUT, "admin-redemption-found.png")
    apg.screenshot(path=shot, full_page=False)
    print("[DONE] shot ->", shot)

    b.close()