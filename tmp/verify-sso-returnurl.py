# -*- coding: utf-8 -*-
"""SSO 回跳拼接错误修复 + 微信全站静默登录 线上回归（手机视口 390x844 dpr2）。
场景：
  A. 微信 UA 进首页 → 自动跳 h.joho.cn 统一登录页（app_code/return_url 全量参数）
     → 模拟回跳 sso-callback?token=invalid（兑换失败仍 leave()）→ 断言落点为 /
  B. 微信 UA 进商品详情页（?invite=TESTINV01）→ 统一页含 invite_code
     → 模拟回跳 → 断言落点为原详情页（invite 保留）
  C. 普通 UA 进首页 → 不发生 SSO 跳转（顺便抓默认渠道商品链接供 B 用）
"""
import time
from urllib.parse import parse_qs, unquote, urlparse

from playwright.sync_api import sync_playwright

SITE = "https://www.youshop.cn"
UNIFIED_HOST = "h.joho.cn"
OUT = r"d:\zhao\nshop\tmp-shots"
INVITE = "TESTINV01"
WECHAT_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "
    "MicroMessenger/8.0.42.0.0"
)
NORMAL_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
)


def mobile_ctx(browser, ua):
    return browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent=ua,
        locale="zh-CN",
    )


def unified_params(url):
    """统一页为 hash 路由：参数在 fragment 的 ? 之后（页面 URL 含 fragment，可直接解析）"""
    frag = urlparse(url).fragment
    qs = frag.split("?", 1)[1] if "?" in frag else ""
    # parse_qs 已自动做 URL 解码，勿再手动 unquote（二次解码会破坏含 % 的值）
    return {k: v[0] for k, v in parse_qs(qs).items()}


def wait_unified_page(pg, timeout_ms=9000):
    """轮询页面 URL 直到落在统一登录页（参数在 fragment，HTTP 请求 URL 不含 fragment，
    必须读 pg.url 而非 request 事件）"""
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        url = pg.url
        if UNIFIED_HOST in url and "pages/sso/login" in url:
            return url
        pg.wait_for_timeout(300)
    return ""


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------- 场景 C：普通 UA 不跳转 + 抓默认渠道商品链接 ----------
        ctxC = mobile_ctx(browser, NORMAL_UA)
        pgC = ctxC.new_page()
        pgC.goto(f"{SITE}/", wait_until="domcontentloaded", timeout=60000)
        pgC.wait_for_timeout(3500)
        assert UNIFIED_HOST not in pgC.url, f"普通 UA 不应跳统一页: {pgC.url}"
        pgC.screenshot(path=f"{OUT}/sso-fix-C-normal-home.png")
        hrefs = pgC.eval_on_selector_all(
            "a[href*='product/']", "els => els.map(e => e.getAttribute('href'))"
        )
        # 排除裸 /product/（无 slug 的 404 页，错误页不走 app.vue 挂载、不触发自动登录）
        default_products = [
            h for h in hrefs
            if h and h.startswith("/product/") and len(h.rstrip("/")) > len("/product") and "t2/" not in h
        ]
        ctxC.close()
        print("DEFAULT_PRODUCT:", default_products[:3])
        print("C normal-UA no-redirect: OK")

        # ---------- 场景 A：微信 UA 进首页 ----------
        ctxA = mobile_ctx(browser, WECHAT_UA)
        pgA = ctxA.new_page()
        # 拦截微信 OAuth 域名，防止统一页在 MicroMessenger UA 下继续跳走（跳转被中止后页面停留在统一页）
        ctxA.route("**open.weixin.qq.com/**", lambda r: r.abort())
        pgA.goto(f"{SITE}/", wait_until="domcontentloaded", timeout=60000)
        unified = wait_unified_page(pgA)
        assert unified, f"微信 UA 进首页未自动跳统一页: {pgA.url}"
        params = unified_params(unified)
        assert params.get("app_code"), f"缺 app_code: {unified}"
        ru = params.get("return_url", "")
        assert ru.startswith(SITE) and ru.endswith("/account/sso-callback"), f"return_url 异常: {ru}"
        print("A1 unified params ok:", params)
        pgA.screenshot(path=f"{OUT}/sso-fix-A-unified.png")
        # 模拟统一页登录成功回跳：token 无效 → 兑换失败 → toast → leave() 回原页
        pgA.goto(
            f"{SITE}/account/sso-callback?token=invalid-token-test",
            wait_until="domcontentloaded", timeout=60000,
        )
        pgA.wait_for_timeout(4500)
        final = pgA.url
        assert final.rstrip("/") == SITE, f"首页回跳落点错误: {final}"
        assert "account/https" not in final, f"仍存在拼接错误: {final}"
        pgA.screenshot(path=f"{OUT}/sso-fix-A-home-final.png")
        print("A2 home final url ok:", final)
        ctxA.close()

        # ---------- 场景 B：微信 UA 进商品详情页（?invite） ----------
        if default_products:
            prod = default_products[0]
        else:
            prod = "/"
            print("WARN: 未抓到默认渠道商品链接，场景 B 退化为首页 ?invite 验证")
        sep = "&" if "?" in prod else "?"
        ctxB = mobile_ctx(browser, WECHAT_UA)
        pgB = ctxB.new_page()
        ctxB.route("**open.weixin.qq.com/**", lambda r: r.abort())
        pgB.goto(f"{SITE}{prod}{sep}invite={INVITE}", wait_until="domcontentloaded", timeout=60000)
        unifiedB = wait_unified_page(pgB)
        assert unifiedB, f"微信 UA 进详情页未自动跳统一页: {pgB.url}"
        paramsB = unified_params(unifiedB)
        assert paramsB.get("invite_code") == INVITE, f"invite_code 未透传: {paramsB}"
        assert paramsB.get("app_code") and paramsB.get("return_url"), f"参数不全: {paramsB}"
        print("B1 unified params ok:", paramsB)
        pgB.screenshot(path=f"{OUT}/sso-fix-B-unified.png")
        pgB.goto(
            f"{SITE}/account/sso-callback?token=invalid-token-test",
            wait_until="domcontentloaded", timeout=60000,
        )
        pgB.wait_for_timeout(4500)
        finalB = pgB.url
        # 中文 slug 会被浏览器百分号编码，unquote 后再与抓取的原始 href 比较
        finalB_dec = unquote(finalB)
        assert finalB_dec.startswith(f"{SITE}{prod}"), f"详情页回跳落点错误: {finalB}"
        assert INVITE in finalB_dec, f"invite 丢失: {finalB}"
        assert "account/https" not in finalB_dec
        pgB.screenshot(path=f"{OUT}/sso-fix-B-detail-final.png")
        print("B2 detail final url ok:", finalB)
        ctxB.close()

        browser.close()
        print("SSO_RETURNURL_REGRESSION_PASSED")


if __name__ == "__main__":
    main()
