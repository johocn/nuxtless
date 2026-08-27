// 商品/品牌图瘦身工具：把 Vendure 资源服务器原生缩放 + webp 转码参数拼进 asset URL。
// 背景：@nuxt/image 用自定义 passthrough provider（validateDomains=false + 原样返回 src），
//       刻意不做本地 sharp 处理——服务器不能在 Linux 上加载 win32 版 sharp 原生二进制（部署铁律：服务器不安装）。
// 于是把 `?w=&format=webp&q=` 交给 Vendure 资产服务端（其服务器自有原生依赖）处理，nshop 只透传 URL。
export const VENDURE_ASSET_RE = /^(https?:\/\/[^/]+\/assets\/)/;

export function assetSrc(src?: string | null, width?: number, q = 70): string {
  if (!src) return "";
  if (!VENDURE_ASSET_RE.test(src)) return src; // 本地静态图/占位原样
  const params: string[] = [];
  if (width) params.push(`w=${width}`);
  params.push("format=webp");
  if (q != null) params.push(`q=${q}`);
  const sep = src.includes("?") ? "&" : "?";
  return `${src}${sep}${params.join("&")}`;
}

// 空图集兜底占位图：内联 SVG data URI（灰底 + 居中文案"暂无图片"），避免手机端主图空白。
export function assetPlaceholderSrc(): string {
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" fill="#9ca3af" font-size="14" text-anchor="middle" dominant-baseline="middle">暂无图片</text></svg>`,
    )
  );
}