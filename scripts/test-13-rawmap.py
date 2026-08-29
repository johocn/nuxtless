from playwright.sync_api import sync_playwright

Q = "query MapDistricts($parentAdcode: String) { mapDistricts(parentAdcode: $parentAdcode) { adcode name level } }"
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto("https://www.youshop.cn/", timeout=40000)
    page.wait_for_load_state("networkidle")
    res = page.evaluate("""async (q) => {
      const r = await fetch('/shop-api', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({operationName:'MapDistricts', query: q, variables: { parentAdcode: null }})
      });
      return { status: r.status, body: await r.text() };
    }""", Q)
    print("=== status:", res["status"])
    print(res["body"][:2000])
    browser.close()