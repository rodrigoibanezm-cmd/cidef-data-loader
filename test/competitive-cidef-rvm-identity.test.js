import test from 'node:test';
import assert from 'node:assert/strict';
import { UNIVERSE_CTES } from '../lib/competitive/universeCtes.js';
import { buildTrajectoryQuery } from '../lib/competitive-trajectory/trajectoryQuery.js';

test('competitive context derives CIDEF target observations from raw DFM only', () => {
  assert.match(UNIVERSE_CTES, /WHERE i\.raw_brand_norm='DFM'/);
  assert.match(
    UNIVERSE_CTES,
    /i\.model_id = ANY\(u\.target_model_ids\) AND i\.raw_brand_norm<>'DFM'/,
  );
});

test('competitive trajectory derives CIDEF target keys from raw DFM only', () => {
  const { sql } = buildTrajectoryQuery({
    targetModelIds: [457],
    dateFrom: '2026-01-01',
    dateTo: '2026-08-31',
    geography: null,
  });

  assert.match(sql, /WHERE i\.raw_brand_norm='DFM'/);
  assert.match(
    sql,
    /i\.model_id = ANY\(u\.target_model_ids\) AND i\.raw_brand_norm<>'DFM'/,
  );
});

test('non-DFM observations of a CIDEF target model remain in the peer market as raw entities', () => {
  assert.match(
    UNIVERSE_CTES,
    /THEN 'RAW:'\|\|coalesce\(i\.raw_brand_norm,''\)\|\|'\|'\|\|coalesce\(i\.raw_model_norm,''\)/,
  );
  assert.match(
    UNIVERSE_CTES,
    /WHEN i\.model_id = ANY\(u\.target_model_ids\) AND i\.raw_brand_norm<>'DFM' THEN NULL/,
  );
});
