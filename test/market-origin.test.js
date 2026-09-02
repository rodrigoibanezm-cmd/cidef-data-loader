import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMarketOrigin } from '../lib/market-origin/applyMarketOrigin.js';
import { getMarketBrandOrigin } from '../lib/market-origin/loadMarketOrigin.js';

function model(brand, name, id, units) {
  return {
    entityKey: `MODEL:${id}`,
    modelId: id,
    identityStatus: 'RESUELTO',
    brand,
    model: name,
    units,
    rowCount: units,
    rank: 1,
    share: null,
    cumulativeShare: null,
  };
}

function baseContext(models) {
  const totalUnits = models.reduce((sum, row) => sum + row.units, 0);
  return {
    scope: { dateFrom: '2026-01-01', dateTo: '2026-07-31', geography: null },
    targets: [{ modelId: 481, brandId: 1, brand: 'DONGFENG', model: 'MAGE' }],
    targetObservations: [{ targetModelId: 481, segment: 'SUV', type: 'SUV', fuel: 'GASOLINA', units: 10, targetUniverseShare: 10 / totalUnits }],
    universes: [{
      key: { segment: 'SUV', type: 'SUV', fuel: 'GASOLINA' },
      targetModelIds: [481], totalUnits, totalModels: models.length,
      totalBrands: new Set(models.map((row) => row.brand)).size, models,
    }],
    validation: { ok: true },
    warnings: [],
  };
}

test('Chile market-origin lookup keeps edge semantics explicit', () => {
  assert.equal(getMarketBrandOrigin('MG').originGroup, 'CHINESE');
  assert.equal(getMarketBrandOrigin('DFLM').originGroup, 'CHINESE');
  assert.equal(getMarketBrandOrigin('Volvo').originGroup, 'NON_CHINESE');
  assert.equal(getMarketBrandOrigin('not-mapped').originGroup, 'UNKNOWN');
});

test('CHINESE filter recalculates share and rank inside the peer universe', () => {
  const context = baseContext([
    model('TOYOTA', 'RAV4', 10, 20),
    model('DONGFENG', 'MAGE', 481, 10),
    model('MG', 'HS', 20, 5),
  ]);
  const filtered = applyMarketOrigin(context, 'CHINESE');
  assert.equal(filtered.universes[0].totalUnits, 15);
  assert.deepEqual(filtered.universes[0].models.map((row) => row.brand), ['DONGFENG', 'MG']);
  assert.equal(filtered.universes[0].models[0].rank, 1);
  assert.equal(filtered.universes[0].models[0].share, 2 / 3);
  assert.equal(filtered.targetObservations[0].targetUniverseShare, 2 / 3);
  assert.equal(filtered.validation.market_origin_complete, true);
  assert.equal(filtered.validation.ok, true);
});

test('unfiltered context keeps prior status when lookup coverage is incomplete', () => {
  const context = baseContext([
    model('DONGFENG', 'MAGE', 481, 10),
    model('NOT MAPPED', 'X', 99, 5),
  ]);
  const enriched = applyMarketOrigin(context);
  assert.equal(enriched.universes[0].totalUnits, 15);
  assert.equal(enriched.validation.market_origin_complete, false);
  assert.equal(enriched.validation.ok, true);
  assert.equal(enriched.warnings.includes('MARKET_ORIGIN_UNKNOWN_PRESENT'), false);
});
