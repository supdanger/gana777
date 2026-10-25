import assert from 'node:assert/strict';
import test from 'node:test';
import { bonusBannerLayout, defaultBonusBannerLayout, normalizeBonusBannerLayout } from '../src/bonus-banner-layout.ts';

test('el encuadre del banner de bonos conserva proporciones propias de cada tema', () => {
  assert.equal(defaultBonusBannerLayout('base').height, 43);
  assert.equal(defaultBonusBannerLayout('dark').height, 49);
  assert.equal(defaultBonusBannerLayout('christmas').height, 50);
  assert.equal(defaultBonusBannerLayout('halloween').height, 60);
  const settings = { home_bonus_layouts: { christmas: { height: 64, width: 170, imageHeight: 145, x: -12, y: 7, radius: 30 } } };
  assert.deepEqual(bonusBannerLayout(settings, 'christmas'), { height: 64, width: 170, imageHeight: 145, x: -12, y: 7, radius: 30 });
  assert.deepEqual(bonusBannerLayout(settings, 'base'), defaultBonusBannerLayout('base'));
  assert.deepEqual(normalizeBonusBannerLayout({ height: 999, width: -10, x: Infinity, radius: -5 }, 'dark'), { height: 80, width: 50, imageHeight: 100, x: 0, y: 0, radius: 0 });
});
