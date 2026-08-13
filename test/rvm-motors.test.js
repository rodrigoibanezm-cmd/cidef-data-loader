import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ELECTRIFICATION_VALUES } from '../lib/motors/classify-electrification.js';
import { paretoInput } from '../lib/rvm-pareto-input.js';
import { duplicateSql, QUALITY_CHECKS, qualitySql } from '../lib/rvm-quality-query.js';
import { getMotor } from '../lib/motors/index.js';

const NAMES = [
  'refresh_vehicle_models_master', 'refresh_vehicle_versions_master',
  'classify_electrification', 'rvm_market_pareto', 'rvm_quality_audit',
];
const source = name => readFileSync(new URL(`../lib/motors/${name}`, import.meta.url), 'utf8');

test('all RVM motors are registered', () => {
  for (const name of NAMES) assert.equal(typeof getMotor(name), 'function');
});

test('master motors use the real model identity', () => {
  const models = source('refresh-vehicle-models-master.js');
  const versions = source('refresh-vehicle-versions-master.js');
  assert.match(models, /ON CONFLICT \(brand_id, modelo_homologado\)/);
  assert.doesNotMatch(models, /vehicle_models_master \(brand_id, marca/);
  assert.doesNotMatch(versions, /vm\.marca/);
});

test('Pareto defaults and validates its closed inputs', () => {
  assert.deepEqual(paretoInput(), {
    universe: 'ALL', threshold_pct: 80, period: null, segment: null, brand: null,
  });
  assert.equal(paretoInput({ universe: 'china', segment: 'suv' }).universe, 'CHINA');
  assert.equal(paretoInput({ segment: 'CAMIONETA' }).segment, 'PICK-UP');
  assert.throws(() => paretoInput({ universe: 'EUROPE' }));
  assert.throws(() => paretoInput({ threshold_pct: 101 }));
  assert.throws(() => paretoInput({ period: '2026-13' }));
});

test('electrification enum is closed', () => {
  assert.deepEqual(ELECTRIFICATION_VALUES, ['ICE', 'HEV', 'PHEV', 'BEV', 'PENDIENTE']);
});

test('quality audit defines every required compact check', () => {
  assert.equal(QUALITY_CHECKS.length, 10);
  for (const name of ['invalid_dates','null_quantity','anomalous_quantity',
    'unmapped_brands','unmapped_models','active_without_master','unmapped_versions',
    'relevant_duplicates','missing_brand_id','missing_source_metadata']) {
    assert.ok(QUALITY_CHECKS.includes(name));
  }
  assert.match(qualitySql(), /^SELECT/);
  assert.doesNotMatch(qualitySql(), /fecha_ingesta|source_row/);
  assert.doesNotMatch(duplicateSql(), /fecha_ingesta|source_row/);
});
