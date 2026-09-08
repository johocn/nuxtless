# -*- coding: utf-8 -*-
"""游客结算 API 复现：抓取匿名 session token -> 加购 -> 设地址/配送 -> checkoutSplitted 计时。
定位游客结算失败/卡点与购物车残留。
"""
import json, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright

SHOP = "http://127.0.0.1:3200/shop-api"
CH = "cnx87ezvmjx8nn3bth6c"

def raw(q, v=None, token=None, timeout=60):
    headers = {"Content-Type": "application/json", "vendure-channel-token": CH}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = Request(SHOP, data=json.dumps({"query": q, "variables": v or {}}).encode(), headers=headers)
    t0 = time.time()
    try:
        with urlopen(req, timeout=timeout) as r:
            tok = r.headers.get("vendure-auth-token")
            dt = time.time() - t0
            return tok, json.loads(r.read().decode()), dt
    except HTTPError as e:
        return None, json.loads(e.read().decode()), time.time() - t0

def log(*a): print(*a, flush=True)

# 用 playwright 拿一个干净的匿名会话 cookie（保证与浏览器同源会话语义），return page/ctx
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context()
    pg = ctx.new_page()
    pg.goto("http://127.0.0.1:3200/", timeout=60000)
    pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(1500)
    log("anon session established, cookies:", ctx.cookies())

    # 加购（首次，应返回 vendure-auth-token 建立匿名会话）
    tok, d, dt = raw("mutation{ removeAllOrderLines{ ...on Order{ id } } }")
    log("removeAll dt=%.2fs tok=%s" % (dt, bool(tok)))
    tok, d, dt = raw('mutation($i:ID!,$q:Int!){ addItemToOrder(productVariantId:$i,quantity:$q){ ...on Order{ id totalQuantity } } }', {"i": "2", "q": 2})
    log("addItem dt=%.2fs tok=%s resp=%s" % (dt, bool(tok), json.dumps(d, ensure_ascii=False)[:200]))

    # 设配送地址（游客：setOrderShippingAddress 即可；setCustomerForOrder 需额外模拟前端）
    addr = {"fullName":"游客张","streetLine1":"测试路1号","city":"上海市","province":"上海市","postalCode":"200000","countryCode":"CN","phoneNumber":"13800000000"}
    tok, d, dt = raw('mutation($i:OrderAddressInput!){ setOrderShippingAddress(input:$i){ ...on Order{ id state shippingAddress { fullName } } } }', {"i": addr}, tok)
    log("setAddr dt=%.2fs tok=%s resp=%s" % (dt, bool(tok), json.dumps(d, ensure_ascii=False)[:220]))

    # 设配送方式
    tok, d, dt = raw('mutation($i:[ID!]!){ setOrderShippingMethod(shippingMethodId:$i){ ...on Order{ id shippingLines { shippingMethod { id } } } } }', {"i": ["1"]}, tok)
    log("setShip dt=%.2fs tok=%s resp=%s" % (dt, bool(tok), json.dumps(d, ensure_ascii=False)[:220]))

    # 结算（计时卡点核心）
    tok, d, dt = raw('mutation($m:String!){ checkoutSplitted(method:$m){ id code state } }', {"m": "fixed-aggregate-collection"}, tok, timeout=180)
    log("checkoutSplitted dt=%.2fs tok=%s resp=%s" % (dt, bool(tok), json.dumps(d, ensure_ascii=False)[:400]))

    # 残留检查
    _, d, _ = raw("{ activeOrder { id totalQuantity lines { quantity productVariantId } } }", None, tok)
    log("activeOrder after:", json.dumps((d.get("data") or {}).get("activeOrder"), ensure_ascii=False)[:300])
    b.close()