# 首页骨架自动补位 · 手机视图截图（390×844 / dpr=2 → 图宽 780px），供操作手册引用。
#
# 每个用例对应一种 t2 渠道 shopContent 变体（由一次性回归脚本预先写入后运行本脚本）：
#   01-fallback-only      shopContent = null                      → 六兜底槽位自动补位
#   02-hot-recommend      sections=[hot, recommend]               → 品牌闪购/十宫格/品质专区仍在
#   03-notice-above-grid  sections=[notice]                       → 公告锚定在十宫格上方
#   04-coupon-latest      sections=[coupon, latest]               → 领券在十宫格下、最新商品在推荐后
#   05-hidden-brand-floor sections=[], hiddenSlots=['brandFloor'] → 品牌闪购被移除
#
# 用法（cwd = 仓库根）：
#   python _e2e/shot_home_skeleton.py                    # 依次截全部 5 个用例
#   python _e2e/shot_home_skeleton.py 03-notice-above-grid 04-coupon-latest
import asyncio
import pathlib
import sys

from playwright.async_api import async_playwright

BASE = "https://www.youshop.cn/t2/"
OUT = pathlib.Path(__file__).parent / "shots"

CASES = [
    "01-fallback-only",
    "02-hot-recommend",
    "03-notice-above-grid",
    "04-coupon-latest",
    "05-hidden-brand-floor",
]


async def capture(page, name: str) -> None:
    await page.goto(BASE, wait_until="networkidle")
    # 逐屏滚动，触发懒加载图片后再整页截图（否则首屏以下的 NuxtImg 为空白）
    height = await page.evaluate("document.body.scrollHeight")
    y = 0
    while y < height:
        await page.evaluate(f"window.scrollTo(0, {y})")
        await page.wait_for_timeout(200)
        y += 844
        height = await page.evaluate("document.body.scrollHeight")
    await page.evaluate("window.scrollTo(0, 0)")
    await page.wait_for_timeout(600)
    path = OUT / f"{name}.png"
    await page.screenshot(path=str(path), full_page=True)
    print(f"saved {path.name}")


async def main() -> None:
    wanted = sys.argv[1:] or CASES
    unknown = [c for c in wanted if c not in CASES]
    if unknown:
        raise SystemExit(f"未知用例 {unknown}；可选：{CASES}")
    OUT.mkdir(exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        page = await ctx.new_page()
        for name in wanted:
            await capture(page, name)
        await browser.close()


asyncio.run(main())
