import { localizeText } from "./detail-config";

/** 券商城目录卡片的库存进度与售罄判定（纯函数，SSR 友好） */
export interface SaleProgress {
  /** 0-100 整数；totalCount<=0（不限量）为 null */
  percent: number | null;
  soldOut: boolean;
}

export function saleProgress(input: {
  claimedCount?: number | null;
  totalCount?: number | null;
  claimable?: boolean | null;
}): SaleProgress {
  const { claimedCount, totalCount, claimable } = input;
  if (claimable === false) {
    return { percent: totalCount && totalCount > 0 ? 100 : null, soldOut: true };
  }
  if (totalCount && totalCount > 0) {
    const percent = Math.min(100, Math.round(((claimedCount ?? 0) / totalCount) * 100));
    return { percent, soldOut: percent >= 100 };
  }
  return { percent: null, soldOut: false };
}

/** 券详情可选增强：description 本地化后非空白才有详情入口 */
export function hasDetail(description: unknown, locale: string): boolean {
  if (!description) return false;
  const text = localizeText(description as never, locale);
  return typeof text === "string" && text.trim().length > 0;
}

export interface DetailParagraph {
  type: "text" | "image";
  content: string;
}

const IMG_LINE_RE = /^!\[[^\]]*\]\(([^)]+)\)$/;

/** description 按行分段：整行 `![图](url)` 为图片段，其余为文本段；非法标记回退文本 */
export function parseDetailParagraphs(text: string): DetailParagraph[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map<DetailParagraph>((line) => {
      const m = IMG_LINE_RE.exec(line);
      return m && m[1] ? { type: "image", content: m[1] } : { type: "text", content: line };
    });
}

/** 图库图片 URL 归一：相对路径拼当前访问 origin，禁止硬编码域名 */
export function detailAssetUrl(url: string, origin: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}
