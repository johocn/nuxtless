"""查询线上 shop-api：列出商品变体的 shippingProfileId 分布，判断是否存在可拆单的多配送档案商品。"""
import json, urllib.request

URL = "https://www.youshop.cn/shop-api"

def q(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

# 1. 当前渠道
active = q("{ activeChannel { id code token defaultLanguageCode } }")
print("activeChannel:", json.dumps(active, ensure_ascii=False))

# 2. 商品（变体带 shippingProfileId）
prod_q = q("""
query($take:Int!){
  products(options:{take:$take}){ items {
    slug name
    variants{ id sku customFields { shippingProfileId } }
  }}
}""", {"take": 40})
prods = prod_q.get("data", {}).get("products", {}).get("items", [])
profiles = {}
rows = []
for p in prods:
    for v in (p.get("variants") or []):
        pid = (v.get("customFields") or {}).get("shippingProfileId")
        rows.append((p.get("slug"), v.get("sku"), pid))
        profiles.setdefault(str(pid), []).append(v.get("sku"))
print("\nshippingProfileId 分布:")
for pid, skus in profiles.items():
    print(f"  profile={pid}: {skus}")
print(f"\n共 {len(rows)} 个变体, {len(profiles)} 个不同配送档案")