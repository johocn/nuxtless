export function stripHtmlToText(html: string, maxLen = 100): string {
  if (!html || typeof html !== 'string') return '';
  let text = String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd().replace(/[，。、,.]$/, '') + '…';
}

export function toAbsoluteUrl(url: string, origin: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return origin + url;
  return `${origin}/${url}`;
}

export function buildShareMeta(i: {
  productName: string;
  featureImage: string;
  assetsImages: string[];
  textDescription: string;
  shareImageUrl: string;
  shopName: string;
  origin: string;
  defaultImage: string;
  defaultTitle: string;
  defaultDesc: string;
}): { title: string; desc: string; imgUrl: string } {
  const title = i.productName || i.shopName || i.defaultTitle;
  const desc = i.textDescription || i.defaultDesc;
  const img = i.featureImage || i.assetsImages[0] || i.shareImageUrl || toAbsoluteUrl(i.defaultImage, i.origin);
  return { title, desc, imgUrl: toAbsoluteUrl(img, i.origin) };
}
