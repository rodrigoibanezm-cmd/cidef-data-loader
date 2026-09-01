import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCompetitiveContext } from '../lib/competitive/assembleCompetitiveContext.js';

test('context keeps unresolved units in universe and exposes ranking', () => {
  const ctx = assembleCompetitiveContext({ dateFrom: '2026-01-01', dateTo: '2026-07-31', geography: null }, {
    targets: [{ modelo_id: 481, marca_id: 1, brand: 'DONGFENG', model: 'MAGE' }],
    target_observations: [{ target_model_id: 481, segment: 'SUV', type: 'SUV', fuel: 'GASOLINA', target_units: 10, target_universe_share: 1 }],
    ranked_models: [
      { segment_key: 'SUV', type_key: 'SUV', fuel_key: 'GASOLINA', segment: 'SUV', type: 'SUV', fuel: 'GASOLINA', target_model_ids: [481], total_units: 15, total_models: 2, total_brands: 2, entity_key: 'MODEL:481', model_id: 481, identity_status: 'RESUELTO', brand: 'DONGFENG', model: 'MAGE', units: 10, row_count: 10, rank: 1, share: 2/3, cumulative_share: 2/3 },
      { segment_key: 'SUV', type_key: 'SUV', fuel_key: 'GASOLINA', segment: 'SUV', type: 'SUV', fuel: 'GASOLINA', target_model_ids: [481], total_units: 15, total_models: 2, total_brands: 2, entity_key: 'RAW:X|Y', model_id: null, identity_status: 'NO_RESUELTO', brand: 'X', model: 'Y', units: 5, row_count: 5, rank: 2, share: 1/3, cumulative_share: 1 },
    ],
    missing_target_ids: [],
    validation: { raw_units: 15, raw_rows: 15, resolved_rows: 10, resolved_units: 10, unresolved_rows: 5, unresolved_units: 5, ambiguous_rows: 0, universe_reconciled: true },
  });
  assert.equal(ctx.universes[0].totalUnits, 15);
  assert.equal(ctx.universes[0].models[1].identityStatus, 'NO_RESUELTO');
  assert.ok(ctx.warnings.includes('UNRESOLVED_IDENTITY_PRESENT'));
  assert.ok(ctx.warnings.includes('INCOMPLETE_IDENTITY_COVERAGE'));
});
