# -*- coding: utf-8 -*-
"""T8 三问题修复回归（手机视口 390x844 dpr=2）
1. 就近库存全仓库展示：距离未知 / 服务城市：全城 / 长春仓带城市
2. 标题与 SKU 区无 P 编码（单规格商品：标题=商品名，SKU 区=规格: 默认）
3. 线上无多规格商品 → 多规格矩阵逻辑由单测覆盖，此处仅记录
"""
import re
from urllib.parse import quote
from playwright.sync_api import sync_playwright

DOMAIN = "https://www.youshop.cn"
PRODUCT = "国信南山温泉节假日房间"
URL = f"{DOMAIN}/t2/product/{quote(PRODUCT)}"
OUT = r"d:\zhao\nshop\tmp-shots"

CITY_STATE = {
    "city": {"name": "长春市", "adcode": "220100"},
    "coords": None,  # 无定位（城市兜底场景）
    "source": "manual",
    "geo": None,
}

AUTO_CODE = re.compile(r"[Pp]\d{13}")


def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch(headless=True).new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            locale="zh-CN",
        )
        page = ctx.new_page()
        page.goto(DOMAIN, wait_until="domcontentloaded", timeout=60000)
        page.evaluate(
            "([s]) => document.cookie = 'location=' + encodeURIComponent(JSON.stringify(s)) + '; path=/; SameSite=Lax'",
            [CITY_STATE],
        )
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2500)

        # ---- 1) 就近库存：全仓库展示 ----
        near = page.locator("text=就近库存")
        txt = near.first.locator("xpath=..").inner_text() if near.count() else ""
        print("NEARBY_TEXT:", repr(txt))
        assert "距离未知" in txt, "无坐标仓应显示「距离未知」"
        assert "服务城市：全城" in txt, "空服务城市仓应显示「服务城市：全城」"
        assert "长春市" in txt, "长春仓应显示服务城市「长春市」"
        assert AUTO_CODE.search(txt) is None, "就近库存区不得出现自动编码"
        page.screenshot(path=f"{OUT}/verify-followups-nearby.png", full_page=False)

        # ---- 2) 标题：无规格隐藏变体名 ----
        h1 = page.locator("h1").first.inner_text()
        print("TITLE:", repr(h1))
        assert h1 == PRODUCT, f"标题应为商品名「{PRODUCT}」，实际 {h1!r}"
        assert AUTO_CODE.search(h1) is None, "标题不得含自动编码"

        # ---- 3) SKU 区：自动编码降级为规格: 默认 ----
        spec = page.locator("text=规格:").first
        spec_txt = spec.inner_text() if spec.count() else ""
        print("SKU_AREA:", repr(spec_txt))
        assert "规格:" in spec_txt and "默认" in spec_txt, (
            f"SKU 区应显示「规格: 默认」，实际 {spec_txt!r}"
        )
        assert AUTO_CODE.search(spec_txt) is None, "SKU 区不得出现自动编码"

        # ---- 4) 整页无自动编码残留 ----
        body = page.inner_text("body")
        hits = AUTO_CODE.findall(body)
        print("PAGE_AUTO_CODE_HITS:", hits)
        assert not hits, f"整页仍出现自动编码: {hits}"
        page.screenshot(path=f"{OUT}/verify-followups-title.png", full_page=False)

        # ---- 5) 多规格矩阵：线上无多规格商品，逻辑由单测覆盖 ----
        matrix_ui = page.locator("text=规格").count()
        print("MATRIX_UI_PRESENT:", matrix_ui, "(线上单规格商品，多规格逻辑由单测覆盖)")

        ctx.close()
        print("ALL_CHECKS_PASSED")


if __name__ == "__main__":
    main()
