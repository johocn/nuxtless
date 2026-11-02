import { describe, it, expect } from "vitest";
import { sanitizeSearchHighlight } from "../sanitize-html";

describe("sanitizeSearchHighlight", () => {
  it("保留 Meili 的 <mark> 高亮", () => {
    expect(sanitizeSearchHighlight("前<mark>命中</mark>后")).toBe("前<mark>命中</mark>后");
  });

  it("保留 <em> 高亮", () => {
    expect(sanitizeSearchHighlight("a<em>b</em>c")).toBe("a<em>b</em>c");
  });

  it("剥离 img/onerror 等危险内容，仅留纯文本", () => {
    const out = sanitizeSearchHighlight('<img src=x onerror="alert(1)">温泉门票');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("onerror");
    expect(out).toContain("温泉门票");
  });

  it("剥离 script 与属性", () => {
    const out = sanitizeSearchHighlight('<script>alert(1)</script><mark onclick="x">t</mark>');
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).toContain("<mark>t</mark>");
  });

  it("空值返回空串", () => {
    expect(sanitizeSearchHighlight(null)).toBe("");
    expect(sanitizeSearchHighlight(undefined)).toBe("");
  });
});
