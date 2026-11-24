/// <mls fileReference="_102033_/l2/cbe/studioAssets.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSET_ATTR_PREFIX,
  AssetUrlResolver,
  assetOverlayCss,
  cssUrls,
  hasLocalVersion,
  mimeOf,
  parseAssetUrl,
  restoreElementAttribute,
  rewriteCssUrls,
  rewriteSrcset,
  swapElementAttribute,
  type IAssetElement,
  type IAssetStorFile,
} from '/_102033_/l2/cbe/studioAssets.js';

test('parseAssetUrl reads the stor identity of a project asset url', () => {
  assert.deepEqual(parseAssetUrl('/_102052_/l3/assets/logo.png'),
    { project: 102052, level: 3, folder: 'assets', shortName: 'logo', extension: '.png' });
  assert.deepEqual(parseAssetUrl('/_102052_/l3/assets/brand/Logo.SVG?x=1#a'),
    { project: 102052, level: 3, folder: 'assets/brand', shortName: 'Logo', extension: '.svg' });
  assert.deepEqual(parseAssetUrl('https://studio.test/_7_/l3/assets/f.woff2', 'https://studio.test'),
    { project: 7, level: 3, folder: 'assets', shortName: 'f', extension: '.woff2' });
});

test('parseAssetUrl refuses anything that is not an l3 asset', () => {
  assert.equal(parseAssetUrl('/_102052_/l2/assets/logo.png'), null, 'l2');
  assert.equal(parseAssetUrl('/_102052_/l3/assets/semextensao'), null);
  assert.equal(parseAssetUrl('/_102052_/l3/assets/../l2/x.js'), null, '..');
  assert.equal(parseAssetUrl('/tarefas/assets/logo.png'), null);
  assert.equal(parseAssetUrl('blob:https://x/123'), null);
  assert.equal(parseAssetUrl('https://other.test/_1_/l3/assets/a.png', 'https://studio.test'), null);
});

test('mime by extension, unknown is octet-stream', () => {
  assert.equal(mimeOf('.SVG'), 'image/svg+xml');
  assert.equal(mimeOf('.woff2'), 'font/woff2');
  assert.equal(mimeOf('.xyz'), 'application/octet-stream');
});

test('only new or changed files have local bytes to show', () => {
  assert.equal(hasLocalVersion('new'), true);
  assert.equal(hasLocalVersion('changed'), true);
  assert.equal(hasLocalVersion('nochange'), false);
  assert.equal(hasLocalVersion('deleted'), false);
  assert.equal(hasLocalVersion(undefined), false);
});

const local = (url: string) => (url.startsWith('/_1_/l3/') ? `blob:${url.slice(8)}` : null);

test('rewriteCssUrls keeps quotes and leaves other urls byte for byte', () => {
  const css = `a{background:url("/_1_/l3/assets/a.png")} b{background:url('/_1_/l3/assets/b.png')} c{background:url( /_1_/l3/assets/c.png )} d{background:url(data:image/png;base64,AA)}`;
  assert.equal(rewriteCssUrls(css, local),
    `a{background:url("blob:assets/a.png")} b{background:url('blob:assets/b.png')} c{background:url(blob:assets/c.png)} d{background:url(data:image/png;base64,AA)}`);
  assert.equal(rewriteCssUrls('x{color:red}', local), 'x{color:red}');
  assert.deepEqual(cssUrls(css), ['/_1_/l3/assets/a.png', '/_1_/l3/assets/b.png', '/_1_/l3/assets/c.png', 'data:image/png;base64,AA']);
});

test('the overlay keeps only what uses a local asset, in the same at-rule', () => {
  const css = [
    `:root{--color-primary:#123;--hero:url(/_1_/l3/assets/hero.webp);--x:1}`,
    `@font-face{font-family:"Marca";font-weight:400;src:url("/_1_/l3/assets/marca.woff2") format("woff2")}`,
    `@font-face{font-family:"Outra";src:url(https://fonts.test/o.woff2)}`,
    `@media (prefers-color-scheme: dark){:root{--hero:url(/_1_/l3/assets/hero-dark.webp);--y:2}}`,
    `@keyframes spin{from{background:url(/_1_/l3/assets/k.png)}}`,
    `/* url(/_1_/l3/assets/comment.png) { */ .z{color:blue}`,
  ].join('\n');
  assert.equal(assetOverlayCss(css, local), [
    `:root{--hero:url(blob:assets/hero.webp)}`,
    `@font-face{font-family:"Marca";font-weight:400;src:url("blob:assets/marca.woff2") format("woff2")}`,
    `@media (prefers-color-scheme: dark){:root{--hero:url(blob:assets/hero-dark.webp)}}`,
  ].join('\n'));
  assert.equal(assetOverlayCss(':root{--a:1}', local), '');
});

test('srcset rewrites each candidate url and keeps descriptors', () => {
  assert.equal(rewriteSrcset('/_1_/l3/assets/a.png 1x, /cdn/b.png 2x', local), 'blob:assets/a.png 1x, /cdn/b.png 2x');
});

function fakeResolver(files: Record<string, IAssetStorFile>) {
  const created: string[] = [];
  const revoked: string[] = [];
  let n = 0;
  const resolver = new AssetUrlResolver(
    {
      getKey: (ref) => `${ref.project}/${ref.folder}/${ref.shortName}${ref.extension}`,
      getFile: (key) => files[key],
    },
    { create: () => { const url = `blob:test/${++n}`; created.push(url); return url; }, revoke: (url) => { revoked.push(url); } },
  );
  return { resolver, created, revoked };
}

const bytes = (status: string, content: string | Blob | null = new Blob([new Uint8Array([1, 2])])) =>
  ({ status, getContent: async () => content });

test('resolver: new and changed become blob:, nochange and missing stay', async () => {
  const { resolver, created } = fakeResolver({
    '1/assets/new.png': bytes('new'),
    '1/assets/changed.png': bytes('changed'),
    '1/assets/published.png': bytes('nochange'),
  });
  assert.equal(await resolver.ensure('/_1_/l3/assets/new.png'), 'blob:test/1');
  assert.equal(await resolver.ensure('/_1_/l3/assets/new.png'), 'blob:test/1', 'read once');
  assert.equal(await resolver.ensure('/_1_/l3/assets/changed.png'), 'blob:test/2');
  assert.equal(await resolver.ensure('/_1_/l3/assets/published.png'), null);
  assert.equal(await resolver.ensure('/_1_/l3/assets/missing.png'), null);
  assert.equal(resolver.peek('/_1_/l3/assets/new.png'), 'blob:test/1');
  assert.equal(created.length, 2);
});

test('resolver: svg text becomes an image/svg+xml blob', async () => {
  let seen: Blob | null = null;
  const resolver = new AssetUrlResolver(
    { getKey: () => 'k', getFile: () => bytes('new', '<svg/>') },
    { create: (blob) => { seen = blob; return 'blob:svg'; }, revoke: () => undefined },
  );
  assert.equal(await resolver.ensure('/_1_/l3/assets/i.svg'), 'blob:svg');
  assert.equal(seen!.type, 'image/svg+xml');
});

test('resolver: invalidate revokes, the next ensure reads the new bytes', async () => {
  const files: Record<string, IAssetStorFile> = { '1/assets/a.png': bytes('new') };
  const { resolver, revoked } = fakeResolver(files);
  assert.equal(await resolver.ensure('/_1_/l3/assets/a.png'), 'blob:test/1');
  resolver.invalidate('/_1_/l3/assets/a.png');
  assert.deepEqual(revoked, ['blob:test/1']);
  assert.equal(await resolver.ensure('/_1_/l3/assets/a.png'), 'blob:test/2');
  files['1/assets/a.png'] = bytes('deleted');
  resolver.invalidate('/_1_/l3/assets/a.png');
  assert.equal(await resolver.ensure('/_1_/l3/assets/a.png'), null, 'deleted goes back to the final url');
});

class FakeEl implements IAssetElement {
  attrs = new Map<string, string>();
  constructor(init: Record<string, string>) { for (const [k, v] of Object.entries(init)) this.attrs.set(k, v); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  hasAttribute(name: string) { return this.attrs.has(name); }
}

test('swap keeps the final url aside and restore puts it back', async () => {
  const { resolver } = fakeResolver({ '1/assets/a.png': bytes('new') });
  const el = new FakeEl({ src: '/_1_/l3/assets/a.png' });
  assert.equal(await swapElementAttribute(el, 'src', resolver), true);
  assert.equal(el.getAttribute('src'), 'blob:test/1');
  assert.equal(el.getAttribute(`${ASSET_ATTR_PREFIX}src`), '/_1_/l3/assets/a.png');
  assert.equal(await swapElementAttribute(el, 'src', resolver), false, 'a blob is never swapped again');
  assert.equal(restoreElementAttribute(el, 'src'), true);
  assert.equal(el.getAttribute('src'), '/_1_/l3/assets/a.png');
  assert.equal(el.hasAttribute(`${ASSET_ATTR_PREFIX}src`), false);
});

test('swap leaves published files, other urls and srcset without local files alone', async () => {
  const { resolver } = fakeResolver({ '1/assets/p.png': bytes('nochange'), '1/assets/a.png': bytes('new') });
  const published = new FakeEl({ src: '/_1_/l3/assets/p.png' });
  assert.equal(await swapElementAttribute(published, 'src', resolver), false);
  assert.equal(published.getAttribute('src'), '/_1_/l3/assets/p.png');
  const other = new FakeEl({ src: '/_1_/l2/x.js' });
  assert.equal(await swapElementAttribute(other, 'src', resolver), false);
  const set = new FakeEl({ srcset: '/_1_/l3/assets/a.png 1x, /_1_/l3/assets/p.png 2x' });
  assert.equal(await swapElementAttribute(set, 'srcset', resolver), true);
  assert.equal(set.getAttribute('srcset'), 'blob:test/1 1x, /_1_/l3/assets/p.png 2x');
});

test('restore never undoes a value the framework wrote after the swap', async () => {
  const { resolver } = fakeResolver({ '1/assets/a.png': bytes('new') });
  const el = new FakeEl({ src: '/_1_/l3/assets/a.png' });
  await swapElementAttribute(el, 'src', resolver);
  el.setAttribute('src', '/cdn/new.png');
  restoreElementAttribute(el, 'src');
  assert.equal(el.getAttribute('src'), '/cdn/new.png');
});

test('swap gives up when the value changed while the bytes were read', async () => {
  let release: () => void = () => undefined;
  const slow: IAssetStorFile = { status: 'new', getContent: () => new Promise((resolve) => { release = () => resolve(new Blob(['x'])); }) };
  const { resolver } = fakeResolver({ '1/assets/a.png': slow });
  const el = new FakeEl({ src: '/_1_/l3/assets/a.png' });
  const running = swapElementAttribute(el, 'src', resolver);
  el.setAttribute('src', '/_1_/l3/assets/b.png');
  release();
  assert.equal(await running, false);
  assert.equal(el.getAttribute('src'), '/_1_/l3/assets/b.png');
});
