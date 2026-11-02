import assert from 'node:assert/strict';
import test from 'node:test';
import { bonusBannerLayout, defaultBonusBannerLayout, normalizeBonusBannerLayout, specialBonusDisplayLayout } from '../src/bonus-banner-layout.ts';

test('el banner usa la proporción estándar y conserva el encuadre guardado por tema', () => {
  for (const theme of ['base', 'dark', 'christmas', 'new-year', 'halloween', 'modern']) {
    assert.equal(defaultBonusBannerLayout(theme).height, 43.5);
  }
  const controls = { buttonX: 0, buttonY: 0, buttonScale: 100, infoX: 43, infoY: -37, infoScale: 100 };
  const settings = { home_bonus_layouts: { christmas: { height: 64, width: 170, imageHeight: 145, x: -12, y: 7, radius: 30 } } };
  assert.deepEqual(bonusBannerLayout(settings, 'christmas'), { height: 64, width: 170, imageHeight: 145, x: -12, y: 7, radius: 30, ...controls });
  assert.deepEqual(bonusBannerLayout(settings, 'base'), defaultBonusBannerLayout('base'));
  assert.deepEqual(normalizeBonusBannerLayout({ height: 999, width: -10, x: Infinity, radius: -5 }, 'dark'), { height: 80, width: 50, imageHeight: 100, x: 0, y: 0, radius: 0, ...controls });
});

test('el banner especial elimina bandas vacías sin cambiar la altura visible de la imagen', () => {
  const saved = { height: 44, imageHeight: 85, width: 108, x: 0, y: 0, radius: 12 };
  const displayed = specialBonusDisplayLayout(saved);
  assert.equal(displayed.height, 37.4);
  assert.equal(displayed.imageHeight, 100);
  assert.equal(displayed.height * displayed.imageHeight / 100, saved.height * saved.imageHeight / 100);
  assert.deepEqual(specialBonusDisplayLayout({ ...saved, imageHeight: 125 }), { ...saved, imageHeight: 125 });
});
