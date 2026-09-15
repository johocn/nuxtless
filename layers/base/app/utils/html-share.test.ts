import { test } from 'node:test';
import assert from 'node:assert';
import { stripHtmlToText, toAbsoluteUrl, buildShareMeta } from './html-share.ts';

test('stripHtmlToText: 剥离标签解实体压缩空白', () => {
  assert.strictEqual(stripHtmlToText('<p><b>Hi</b>&nbsp;there</p>'), 'Hi there');
});
test('stripHtmlToText: 空串/纯空白返回空', () => {
  assert.strictEqual(stripHtmlToText(''), '');
  assert.strictEqual(stripHtmlToText('<p></p>'), '');
  assert.strictEqual(stripHtmlToText('   '), '');
});
test('stripHtmlToText: 截断100字加省略号', () => {
  const out = stripHtmlToText('x'.repeat(120));
  assert.ok(out.endsWith('…'));
  assert.ok(out.length <= 101);
});
test('toAbsoluteUrl: 相对补origin绝对保留', () => {
  assert.strictEqual(toAbsoluteUrl('/a.png', 'https://x.com'), 'https://x.com/a.png');
  assert.strictEqual(toAbsoluteUrl('https://x.com/a.png', 'https://y.com'), 'https://x.com/a.png');
});
test('buildShareMeta: 无图兜底到默认图', () => {
  const m = buildShareMeta({ productName: '', featureImage: '', assetsImages: [], textDescription: '', shareImageUrl: '', shopName: '', origin: 'https://x.com', defaultImage: '/share-default.jpg', defaultTitle: 'T', defaultDesc: 'D' });
  assert.strictEqual(m.imgUrl, 'https://x.com/share-default.jpg');
  assert.strictEqual(m.title, 'T');
  assert.strictEqual(m.desc, 'D');
});
