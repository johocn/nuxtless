# -*- coding: utf-8 -*-
"""订单核销码 交付验收 手机视口(390x844, dpr2=780x1688) 三场景截图回归。
1) orders-list-cards.png       : 已登录账号 /account/orders 卡片式列表(卡片+状态徽标+操作)
2) orders-detail-redemption.png: 订单详情(核销码卡+二维码+自提/信息卡)
3) admin-redemption.png        : /admin/redemption 管理核销页(token区+输入框)
流程: UI 登录顾客账号 -> Shop API(共享登录会话) 构一笔自提单 -> superadmin 结算触发核销码
      -> 列表截图 -> 详情截图 -> 管理页截图。
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
VARIANT_PICKUP = 48        # 门店自提 音箱/中行
SHIP_METHOD = "1"
PICKUP_LOC = "1"
PICKUP_TYPE = "store"
SUPERADMIN = ("superadmin", "z123123")

def http_json(url, q, v=None, headers=None, method="POST"):
    b = json.dumps({"query": q, "variables": v or {}}).encode()
    req = Request(url, data=b, headers={"Content-Type": "application/json", **(headers or {})}, method=method)
    try:
        with urlopen(req, timeout=40) as r:
            return (r.headers.get("vendure-auth-token") or ""), json.loads(r.read().decode())
    except HTTPError as e:
        return "", json.loads(e.read().decode())

def admin_login():
    token, body = http_json(ADMIN_API, 'mutation($u:String!,$p:String!){ login(username:$u,password:$p){ __typename } }',
                            {"u": SUPERADMIN[0], "p": SUPERADMIN[1]})
    if not token:
        raise RuntimeError("superadmin login failed: " + json.dumps(body, ensure_ascii=False)[:400])
    return token

def admin_settle(token, order_code):
    AH = {"Authorization": "Bearer " + token, "vendure-channel-token": CH}
    _, d = http_json(ADMIN_API, 'query($c:String!){ orders(options:{filter:{code:{eq:$c}}}){ items{ id state payments{ id state } } } }', {"c": order_code}, AH)
    o = (d.get("data") or {}).get("orders", {}).get("items") or []
    if not o:
        raise RuntimeError("order not found in admin for " + order_code)
    for pay in o[0]["payments"]:
        if pay["state"] == "Authorized":
            http_json(ADMIN_API, 'mutation{ transitionPaymentToState(id:"%s", state:"Settled"){ ...on Payment{ state } } }' % pay["id"], headers=AH)
    return o[0]["id"]

def build_pickup_order(ctx):
    """用登录会话(共享 cookie)走 Shop API 构一笔自提单，返回订单 code。"""
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
    code = arr[0]["code"]
    # 补偿物流地址(自提单仍需), 重复调用稳定化
    try:
        gql('mutation{ setOrderCustomFields(){ ...on Order{ id } } }')
    except Exception:
        pass
    return code

def grab_redemption(page, code):
    """浏览器内同源 shop-api 调 orderRedemptionCode, 返回是否成功拿到顺手文本。"""
    r = page.request.post(SHOP, data=json.dumps({"query": '''query{ type OrderRedemptionCodeInput { orderCode: String! } orderRedemptionCode(input:{ orderCode:"%s" }){ redemptionCode qrPayload claimed canAccess } }''' % code,
            "variables": {}}), headers={"Content-Type": "application/json", "vendure-channel-token": CH})
    return json.loads(r.text())

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)

    # ============ C 端顾客登录会话 ============
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True, locale="zh-CN")
    pg = ctx.new_page()
    pg.goto(BASE + "/account/login", timeout=90000)
    pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(2500)
    pg.locator("input[type=email], input[name=username], input[type=text]").first.fill(EMAIL)
    pg.locator("input[type=password]").first.fill(PASSWORD)
    pg.get_by_role("button").filter(has_text=re.compile("登|Sign")).first.click(timeout=8000)
    pg.wait_for_timeout(4500)
    pg.goto(BASE + "/account/orders", timeout=90000)
    pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(3000)
    print("login/customer nav ->", pg.url)

    # 若列表为空/无自提单, 现构一件并超管结算生成核销码
    body0 = pg.inner_text("body")
    has_card = "订单" in body0
    print("orders page url:", pg.url, "| has内容:", has_card)
    order_code = None
    token = admin_login()
    if True:
        order_code = build_pickup_order(ctx)
        admin_settle(token, order_code)
        print("built+settled order:", order_code)
    pg.reload(timeout=90000)
    pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(3500)

    # ---------- 场景1: 订单列表 卡片式 ----------
    body1 = pg.inner_text("body")
    print("=== scenario1 列表 ===")
    print("has订单标题:", "订单" in body1, "| code可见:", order_code in body1 if order_code else False)
    pg.screenshot(path=os.path.join(OUT, "orders-list-cards.png"), full_page=True)
    # 卡片截图(仅视口)以便放大细节
    pg.screenshot(path=os.path.join(OUT, "orders-list-cards-viewport.png"), full_page=False)

    # ---------- 场景2: 订单详情 核销码卡 + 二维码 + 自提卡 ----------
    pg.goto(f"{BASE}/account/orders/{order_code}", timeout=90000)
    pg.wait_for_load_state("networkidle")
    # 等核销码卡加载(OrderRedemptionCode 请求 + qrcode 生成)
    redemption_text = ""
    for _ in range(20):
        pg.wait_for_timeout(1200)
        redemption_text = pg.inner_text("body")
        if "核销码" in redemption_text and re.search(r"[A-Z0-9]{4,}", redemption_text):
            break
    body2 = pg.inner_text("body")
    qr_loaded = pg.locator("img[alt=核销码], section img").count() > 0
    # 打印核销码卡附近文本
    print("=== scenario2 详情 ===")
    m = re.search(r"核销码([^\n]*\n[^\n]+)", body2)
    print("has核销码卡:", "核销码" in body2, "| has自提:", ("自提" in body2), "| qr img:", qr_loaded)
    if m: print("核销码段:", m.group(1)[:80])
    print("详情 url:", pg.url)
    pg.screenshot(path=os.path.join(OUT, "orders-detail-redemption.png"), full_page=True)

    # ---------- 场景3: 管理端核销页 ----------
    actx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                         is_mobile=True, has_touch=True, locale="zh-CN")
    apg = actx.new_page()
    apg.goto(BASE + "/admin/redemption", timeout=90000)
    apg.wait_for_load_state("networkidle"); apg.wait_for_timeout(2500)
    abody = apg.inner_text("body")
    print("=== scenario3 管理核销页 ===")
    print("has标题:", ("核销" in abody), "| has令牌:", ("令牌" in abody or "token" in abody.lower()), "| has输入框placeholder:", "请输入" in abody)
    apg.screenshot(path=os.path.join(OUT, "admin-redemption.png"), full_page=True)

    b.close()
    print("\n[DONE] shots ->")
    for f in ["orders-list-cards.png", "orders-detail-redemption.png", "admin-redemption.png"]:
        print("  ", os.path.join(OUT, f))