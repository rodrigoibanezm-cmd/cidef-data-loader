import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignVehiclesToEpisodes,
  buildPriceEpisodes,
  buildStatePoints,
  classifyChange,
  resolvePriceVersions,
} from '../lib/canonical/price-episode-canonicalizer-v01.js';

const base = {
  precio_neto: 100,
  precio_lista: 120,
  precio_con_iva: 143,
  bono_cidef: 10,
  bono_forum: 5,
  bono_mes: 0,
};

function cleanPoint(date, tuple = base, pvid = 1, versionId = 1001, pvids = [pvid]) {
  return {
    price_version_id: pvid,
    price_version_ids: pvids,
    version_id: versionId,
    resolution_status: 'resolved',
    vigencia_desde: date,
    source_status: 'OK',
    tuple: { ...tuple },
    source_rows: 1,
    source_variant_count: 1,
    source_files: ['a.xlsx'],
  };
}

function conflictPoint(date, pvid = 1, versionId = 1001, pvids = [pvid]) {
  return {
    price_version_id: pvid,
    price_version_ids: pvids,
    version_id: versionId,
    resolution_status: 'resolved',
    vigencia_desde: date,
    source_status: 'SOURCE_CONFLICT',
    tuple: null,
    source_rows: 2,
    source_variant_count: 2,
    source_files: ['a.xlsx', 'b.xlsx'],
  };
}

test('consecutive equal states collapse into one episode', () => {
  const episodes = buildPriceEpisodes([cleanPoint('2026-01-01'), cleanPoint('2026-02-01')]);
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].vigencia_desde, '2026-01-01');
  assert.equal(episodes[0].vigencia_hasta, null);
  assert.equal(episodes[0].source_rows, 2);
});

test('bonus-only change is BONO', () => {
  assert.equal(classifyChange(base, { ...base, bono_cidef: 20 }), 'BONO');
});

test('price-only change is PRECIO', () => {
  assert.equal(classifyChange(base, { ...base, precio_lista: 130 }), 'PRECIO');
});

test('price and bonus change is PRECIO_Y_BONO', () => {
  assert.equal(classifyChange(base, { ...base, precio_lista: 130, bono_mes: 5 }), 'PRECIO_Y_BONO');
});

test('NULL is distinct from zero and delta stays NULL', () => {
  const first = cleanPoint('2026-01-01', { ...base, bono_mes: null });
  const second = cleanPoint('2026-02-01', { ...base, bono_mes: 0 });
  const episodes = buildPriceEpisodes([first, second]);
  assert.equal(episodes.length, 2);
  assert.equal(episodes[1].tipo_cambio, 'BONO');
  assert.equal(episodes[1].delta_bono_mes, null);
});

test('same-day conflicting source tuples become SOURCE_CONFLICT', () => {
  const resolutionMap = new Map([[1, { status: 'resolved', version_id: 1001 }]]);
  const history = [
    { price_version_id: 1, vigencia_desde: '2026-01-01', ...base, source_file: 'a.xlsx' },
    { price_version_id: 1, vigencia_desde: '2026-01-01', ...base, bono_mes: 1, source_file: 'b.xlsx' },
  ];
  const points = buildStatePoints(history, resolutionMap);
  assert.equal(points[0].source_status, 'SOURCE_CONFLICT');
  assert.equal(points[0].source_variant_count, 2);
});

test('conflict cuts continuity even when clean tuple repeats afterwards', () => {
  const episodes = buildPriceEpisodes([
    cleanPoint('2026-01-01'),
    conflictPoint('2026-02-01'),
    cleanPoint('2026-03-01'),
  ]);
  assert.equal(episodes.length, 3);
  assert.equal(episodes[0].vigencia_hasta, '2026-01-31');
  assert.equal(episodes[1].source_status, 'SOURCE_CONFLICT');
  assert.equal(episodes[1].vigencia_hasta, '2026-02-28');
  assert.equal(episodes[2].tipo_cambio, 'NO_CHANGE');
});

test('VIN inside clean episode is assigned', () => {
  const episodes = buildPriceEpisodes([cleanPoint('2026-01-01')]);
  const result = assignVehiclesToEpisodes([
    { vehiculo_id: 1, vin: 'VIN1', version_id: 1001, fecha_factura: '2026-01-15', numero_factura: '1', vendido: true },
  ], episodes);
  assert.equal(result.assigned, 1);
});

test('VIN outside episode validity is not assigned', () => {
  const e = cleanPoint('2026-01-01');
  const episodes = buildPriceEpisodes([e, cleanPoint('2026-02-01', { ...base, precio_lista: 130 })]);
  episodes[0].vigencia_hasta = '2026-01-31';
  episodes[1].vigencia_desde = '2026-03-01';
  const result = assignVehiclesToEpisodes([
    { vehiculo_id: 2, vin: 'VIN2', version_id: 1001, fecha_factura: '2026-02-15', vendido: true },
  ], episodes);
  assert.equal(result.assigned, 0);
  assert.equal(result.unassigned, 1);
});

test('VIN is never assigned to SOURCE_CONFLICT', () => {
  const episodes = buildPriceEpisodes([conflictPoint('2026-01-01')]);
  const result = assignVehiclesToEpisodes([
    { vehiculo_id: 3, vin: 'VIN3', version_id: 1001, fecha_factura: '2026-01-15', vendido: true },
  ], episodes);
  assert.equal(result.assigned, 0);
  assert.equal(result.eligible, 0);
});

test('VIN matching two clean episodes is ambiguous, not arbitrarily assigned', () => {
  const a = { ...buildPriceEpisodes([cleanPoint('2026-01-01', base, 1, 1001)])[0], vigencia_hasta: null };
  const b = { ...buildPriceEpisodes([cleanPoint('2026-01-01', base, 2, 1002)])[0], version_id: 1001, vigencia_hasta: null };
  const result = assignVehiclesToEpisodes([
    { vehiculo_id: 4, vin: 'VIN4', version_id: 1001, fecha_factura: '2026-01-15', vendido: true },
  ], [a, b]);
  assert.equal(result.ambiguous, 1);
  assert.equal(result.assigned, 0);
});

test('historical T03 price_version 77 is excluded and never blocks resolution', () => {
  const result = resolvePriceVersions([
    { price_version_id: 77, marca: 'LEAPMOTOR', modelo: 'T 0 3', version: 'T 0 3 Automática', version_raw: 'T 0 3 Automática' },
  ], [], []);
  assert.deepEqual(result.counts, { total: 1, resolved: 0, excluded: 1, unresolved: 0 });
  assert.equal(result.map.get(77).status, 'excluded');
});

test('two price_version_ids resolving to one version_id share one canonical timeline', () => {
  const episodes = buildPriceEpisodes([
    cleanPoint('2026-01-01', base, 76, 9906),
    cleanPoint('2026-03-02', base, 56, 9906),
  ]);
  assert.equal(episodes.length, 1);
  assert.deepEqual(episodes[0].price_version_ids, [56, 76]);
  assert.equal(episodes[0].price_version_id, 76);
});

test('same date same tuple across price_version_ids merges into one canonical state', () => {
  const resolutionMap = new Map([
    [76, { status: 'resolved', version_id: 9906 }],
    [56, { status: 'resolved', version_id: 9906 }],
  ]);
  const points = buildStatePoints([
    { price_version_id: 76, vigencia_desde: '2026-03-02', ...base, source_file: 'old.xlsx' },
    { price_version_id: 56, vigencia_desde: '2026-03-02', ...base, source_file: 'new.xlsx' },
  ], resolutionMap);
  assert.equal(points.length, 1);
  assert.equal(points[0].source_status, 'OK');
  assert.deepEqual(points[0].price_version_ids, [56, 76]);
  assert.equal(points[0].source_rows, 2);
});

test('price_version handoff with same tuple preserves continuity', () => {
  const episodes = buildPriceEpisodes([
    cleanPoint('2024-04-02', base, 76, 9906),
    cleanPoint('2026-03-02', base, 56, 9906),
  ]);
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].vigencia_desde, '2024-04-02');
  assert.equal(episodes[0].vigencia_hasta, null);
});

test('price_version handoff with different tuple starts a new episode', () => {
  const episodes = buildPriceEpisodes([
    cleanPoint('2024-04-02', base, 76, 9906),
    cleanPoint('2026-03-02', { ...base, bono_forum: 15 }, 56, 9906),
  ]);
  assert.equal(episodes.length, 2);
  assert.equal(episodes[0].vigencia_hasta, '2026-03-01');
  assert.equal(episodes[1].tipo_cambio, 'BONO');
});

test('same date same version_id with distinct tuples is SOURCE_CONFLICT', () => {
  const resolutionMap = new Map([
    [76, { status: 'resolved', version_id: 9906 }],
    [56, { status: 'resolved', version_id: 9906 }],
  ]);
  const points = buildStatePoints([
    { price_version_id: 76, vigencia_desde: '2026-03-02', ...base, source_file: 'old.xlsx' },
    { price_version_id: 56, vigencia_desde: '2026-03-02', ...base, bono_mes: 99, source_file: 'new.xlsx' },
  ], resolutionMap);
  assert.equal(points.length, 1);
  assert.equal(points[0].source_status, 'SOURCE_CONFLICT');
  assert.equal(points[0].source_variant_count, 2);
});

test('cross-price-version SOURCE_CONFLICT cuts canonical continuity', () => {
  const episodes = buildPriceEpisodes([
    cleanPoint('2026-01-01', base, 76, 9906),
    conflictPoint('2026-03-02', 56, 9906, [56, 76]),
    cleanPoint('2026-04-01', base, 56, 9906),
  ]);
  assert.equal(episodes.length, 3);
  assert.equal(episodes[0].vigencia_hasta, '2026-03-01');
  assert.equal(episodes[1].vigencia_hasta, '2026-03-31');
  assert.equal(episodes[2].vigencia_desde, '2026-04-01');
});

test('VIN after technical price_version handoff has at most one canonical episode candidate', () => {
  const episodes = buildPriceEpisodes([
    cleanPoint('2024-04-02', base, 76, 9906),
    cleanPoint('2026-03-02', base, 56, 9906),
  ]);
  const result = assignVehiclesToEpisodes([
    { vehiculo_id: 10, vin: 'S50VIN', version_id: 9906, fecha_factura: '2026-06-01', vendido: true },
  ], episodes);
  assert.equal(result.ambiguous, 0);
  assert.equal(result.assigned, 1);
});

test('S50 EV 76 to 56 canonical handoff yields zero ambiguous VIN in fixture', () => {
  const resolutionMap = new Map([
    [76, { status: 'resolved', version_id: 9906 }],
    [56, { status: 'resolved', version_id: 9906 }],
  ]);
  const history = [
    { price_version_id: 76, vigencia_desde: '2024-04-02', ...base, source_file: '2024.xlsx' },
    { price_version_id: 76, vigencia_desde: '2026-03-02', ...base, source_file: 'old.xlsx' },
    { price_version_id: 56, vigencia_desde: '2026-03-02', ...base, source_file: 'new.xlsx' },
    { price_version_id: 56, vigencia_desde: '2026-09-04', ...base, bono_mes: 20, source_file: 'sep.xlsx' },
  ];
  const episodes = buildPriceEpisodes(buildStatePoints(history, resolutionMap));
  const result = assignVehiclesToEpisodes([
    { vehiculo_id: 11, vin: 'S50A', version_id: 9906, fecha_factura: '2026-03-03', vendido: true },
    { vehiculo_id: 12, vin: 'S50B', version_id: 9906, fecha_factura: '2026-08-01', vendido: true },
  ], episodes);
  assert.equal(result.ambiguous, 0);
  assert.equal(result.assigned, 2);
});
