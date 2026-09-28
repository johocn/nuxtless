// 富文本净化工具（SSR 友好）：商品描述 / 首页装修富文本楼层等后台可编辑 HTML，
// 渲染前统一走白名单清洗，避免存储型 XSS（事件属性、script、javascript: 协议等）。
// isomorphic-dompurify 在 SSR 端用 jsdom、客户端用原生 DOM，两处行为一致。
import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "span", "div", "section", "article", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "del", "sub", "sup", "mark",
  "ul", "ol", "li",
  "a", "img", "video", "source", "figure", "figcaption",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "hr", "code", "pre",
];

const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "target", "rel",
  "width", "height", "style", "class", "colspan", "rowspan",
  "controls", "poster", "preload", "type",
];

/**
 * 白名单净化后台可编辑富文本。
 * @param html 原始 HTML（可能含危险标签/属性）
 * @returns 净化后的 HTML；输入为空时返回空串
 */
export function sanitizeRichText(html?: string | null): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // 禁止 data:/javascript: 等危险协议（DOMPurify 默认已拦截 javascript:，
    // 这里显式放行 http(s)/mailto/tel 与相对路径，其余一律剥离）
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
