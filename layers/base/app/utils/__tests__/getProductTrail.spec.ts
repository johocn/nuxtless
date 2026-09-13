import { describe, expect, it } from "vitest";
import { pickTopCollection, getProductTrail } from "../getProductTrail";
import type { TrailCollection } from "../getProductTrail";

const root: TrailCollection = { slug: "__root_collection__", name: "根", parent: null };
const cat = (slug: string, name: string, parent: TrailCollection | null = null): TrailCollection => ({
  slug,
  name,
  parent,
});
const menuTops = [{ slug: "electronics" }, { slug: "clothing" }];

describe("pickTopCollection", () => {
  it("按菜单顶级分类命中（商品分类的 parent 是顶级）", () => {
    const child = cat("phones", "手机", cat("electronics", "电子", root));
    expect(pickTopCollection([child], menuTops)?.slug).toBe("electronics");
  });

  it("商品分类本身是顶级时返回自身", () => {
    expect(pickTopCollection([cat("electronics", "电子", root)], menuTops)?.slug).toBe("electronics");
  });

  it("无菜单命中时取商品返回的第一个顶级分类", () => {
    const a = cat("a", "A", root);
    const b = cat("b", "B", root);
    expect(pickTopCollection([a, b], [])?.slug).toBe("a");
  });

  it("过滤掉根分类", () => {
    expect(pickTopCollection([root], menuTops)).toBeNull();
  });

  it("空集合返回 null", () => {
    expect(pickTopCollection([], menuTops)).toBeNull();
  });
});

describe("getProductTrail", () => {
  it("返回单个面包屑项（label=顶级分类名, to=/category/slug）", () => {
    const product = {
      collections: [cat("phones", "手机", cat("electronics", "电子", root))],
    } as any;
    expect(getProductTrail(product, menuTops)).toEqual([
      { label: "电子", to: "/category/electronics" },
    ]);
  });
});
