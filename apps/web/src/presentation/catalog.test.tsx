import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CatalogPreviewCard } from '../components/CatalogPreviewCard';
import { catalogMode, previewVehicles } from './catalog';

test('unconfigured, pending, failed and negative resource checks never expose native catalog actions', () => {
  assert.equal(catalogMode(false, { isPending: true, isSuccess: false }), 'preview');
  assert.equal(catalogMode(false, { isPending: false, isSuccess: true, data: true }), 'preview');
  assert.equal(catalogMode(true, { isPending: true, isSuccess: false }), 'checking');
  assert.equal(catalogMode(true, { isPending: false, isSuccess: false, data: true }), 'unavailable');
  assert.equal(catalogMode(true, { isPending: false, isSuccess: true, data: false }), 'unavailable');
  assert.equal(catalogMode(true, { isPending: false, isSuccess: true, data: true }), 'native');
});

test('each preview opens a detail experience while exposing no transaction controls or prices', () => {
  for (const vehicle of previewVehicles) {
    for (const mode of ['preview', 'checking', 'unavailable'] as const) {
      const html = renderToStaticMarkup(createElement(CatalogPreviewCard, { vehicle, mode }));
      assert.match(html, /Demo Preview/);
      assert.match(html, /No on-chain listing, owner, or sale price/);
      assert.match(html, /aria-haspopup="dialog"/);
      assert.match(html, /Explore concept/);
      assert.match(html, /Trading unavailable for this concept/);
      assert.match(html, /No transaction is being simulated, submitted or confirmed/);
      assert.doesNotMatch(html, /mUSDC|Buy vehicle|Approve spending|0x[a-f0-9]{40}/);
    }
  }
});
