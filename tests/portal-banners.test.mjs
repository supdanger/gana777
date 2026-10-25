import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPortalBannerLayout, maxPortalBannersPerPlace, normalizePortalBanners, portalBannersFor } from '../src/portal-banners.ts';

const id = '11111111-1111-4111-8111-111111111111';
const path = `portal-banners/${id}.webp`;

test('los banners extra se guardan por tema y por pantalla', () => {
  assert.equal(defaultPortalBannerLayout('halloween', 'home').height, 60);
  assert.equal(defaultPortalBannerLayout('halloween', 'withdrawal').height, 36);
  const saved = [
    { id, theme: 'halloween', place: 'home', path, layout: { height: 55, width: 120, imageHeight: 90, x: 4, y: -3, radius: 18 } },
    { id: '22222222-2222-4222-8222-222222222222', theme: 'halloween', place: 'withdrawal', path: 'portal-banners/22222222-2222-4222-8222-222222222222.png', layout: { height: 40 } },
    { id: '33333333-3333-4333-8333-333333333333', theme: 'base', place: 'home', path: 'portal-banners/33333333-3333-4333-8333-333333333333.jpg' },
    { id: 'not-an-id', theme: 'halloween', place: 'home', path },
    { id: '44444444-4444-4444-8444-444444444444', theme: 'halloween', place: 'perfil', path },
  ];
  assert.deepEqual(portalBannersFor(saved, 'halloween', 'home').map(banner => banner.layout.height), [55]);
  assert.equal(portalBannersFor(saved, 'halloween', 'withdrawal')[0].layout.width, 100);
  assert.equal(portalBannersFor(saved, 'base', 'home')[0].path.endsWith('.jpg'), true);
  assert.equal(normalizePortalBanners(saved).length, 3);
  assert.equal(normalizePortalBanners({}).length, 0);
  const overflow = Array.from({ length: maxPortalBannersPerPlace + 2 }, (_, index) => ({
    id: `55555555-5555-4555-8555-55555555555${index}`,
    theme: 'christmas',
    place: 'home',
    path: `portal-banners/55555555-5555-4555-8555-55555555555${index}.webp`,
  }));
  assert.equal(portalBannersFor(overflow, 'christmas', 'home').length, maxPortalBannersPerPlace);
});
