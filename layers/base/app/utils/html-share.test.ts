import { test, expect } from 'vitest';
import { stripHtmlToText, toAbsoluteUrl, buildShareMeta } from './html-share.ts';

test('stripHtmlToText: 剥离标签解实体压缩空白', () => {
  expect(stripHtmlToText('<p><b>Hi</b>&nbsp;there</p>')).toBe('Hi there');
});
test('stripHtmlToText: 空串/纯空白返回空', () => {
  expect(stripHtmlToText('')).toBe('');
  expect(stripHtmlToText('<p></p>')).toBe('');
  expect(stripHtmlToText('   ')).toBe('');
});
test('stripHtmlToText: 截断100字加省略号', () => {
  const out = stripHtmlToText('x'.repeat(120));
  expect(out.endsWith('…')).toBe(true);
  expect(out.length <= 101).toBe(true);
});
test('toAbsoluteUrl: 相对补origin绝对保留', () => {
  expect(toAbsoluteUrl('/a.png', 'https://x.com')).toBe('https://x.com/a.png');
  expect(toAbsoluteUrl('https://x.com/a.png', 'https://y.com')).toBe('https://x.com/a.png');
});
test('buildShareMeta: 无图兜底到默认图', () => {
  const m = buildShareMeta({ productName: '', featureImage: '', assetsImages: [], textDescription: '', shareImageUrl: '', shopName: '', origin: 'https://x.com', defaultImage: '/share-default.jpg', defaultTitle: 'T', defaultDesc: 'D' });
  expect(m.imgUrl).toBe('https://x.com/share-default.jpg');
  expect(m.title).toBe('T');
  expect(m.desc).toBe('D');
});
