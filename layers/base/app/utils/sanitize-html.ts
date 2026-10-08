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

// style 值级白名单：仅保留展示类 CSS 声明。position/z-index/transform/opacity/
// inset/display 等可布局覆盖属性一律剔除——否则后台富文本可构造透明全屏钓鱼浮层
//（position:fixed + inset:0 + z-index 覆盖全站）。图片/背景图经 url() 注入的
// 路径不可控（追踪像素、超大图），含 url()/expression() 的声明整条丢弃。
const CSS_PROP_WHITELIST = new Set([
  // 颜色/背景
  "color", "background", "background-color",
  // 字体与文本
  "font", "font-family", "font-size", "font-weight", "font-style",
  "letter-spacing", "line-height", "text-align", "text-decoration",
  "text-decoration-color", "text-decoration-line", "text-indent",
  "text-transform", "text-shadow", "text-orientation", "vertical-align",
  "white-space", "word-break", "word-spacing", "overflow-wrap",
  // 盒模型（仅间距/边框/圆角）
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border", "border-color", "border-style", "border-width",
  "border-top", "border-right", "border-bottom", "border-left",
  "border-radius", "border-collapse", "border-spacing",
  // 尺寸
  "width", "height", "max-width", "max-height", "min-width", "min-height",
  // 列表/表格
  "list-style", "list-style-type",
  // 装饰
  "box-shadow",
]);

// 声明值危险模式：CSS url() 加载外部资源、expression() 旧式脚本注入、@import 外链样式
const CSS_VALUE_DANGEROUS = /url\(|expression\(|@import|javascript:/i;

/** 过滤 style 属性：逐声明按属性白名单 + 值危险模式检查（幂等，可安全重复执行） */
function filterStyleAttr(node: Element): void {
  const style = node.getAttribute("style");
  if (!style) return;
  const cleaned = style
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => {
      const idx = decl.indexOf(":");
      if (idx <= 0) return false;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      if (!CSS_PROP_WHITELIST.has(prop)) return false;
      return !CSS_VALUE_DANGEROUS.test(decl.slice(idx + 1));
    })
    .join("; ");
  if (cleaned) node.setAttribute("style", cleaned);
  else node.removeAttribute("style");
}

// hook 注册在模块加载时完成且过滤幂等（重复注册/重复执行无副作用）；
// DOMPurify hook 为全局挂载，仅影响本仓唯一的 sanitizeRichText 调用面。
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  const el = node as Element;
  if (el && typeof el.getAttribute === "function" && el.hasAttribute?.("style")) {
    filterStyleAttr(el);
  }
});

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
