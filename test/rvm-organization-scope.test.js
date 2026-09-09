import test from 'node:test';
import assert from 'node:assert/strict';
import { rvmOrganizationResolutionCtes } from '../lib/rvm/rvmOrganizationScopeSql.js';

test('CIDEF organization scope is determined exclusively by raw DFM brand', () => {
  const sql = rvmOrganizationResolutionCtes({
    organizationScope: 'CIDEF',
    organizationParam: '$3',
  });

  assert.match(sql, /WHEN i\.raw_brand_norm='DFM' THEN 'INCLUDED'/);
  assert.match(sql, /ELSE 'EXCLUDED_OTHER_ORGANIZATION'/);
  assert.match(sql, /WHEN i\.raw_brand_norm='DFM' THEN 'RAW_BRAND_DFM'/);
  assert.match(sql, /ELSE 'RAW_BRAND_EXCLUSION'/);
  assert.match(sql, /ARRAY\[\(SELECT organization_id FROM selected_organization\)\]::bigint\[\]/);
});

test('CIDEF inclusion cannot be granted by canonical membership or historical rules', () => {
  const sql = rvmOrganizationResolutionCtes({
    organizationScope: 'CIDEF',
    organizationParam: '$3',
  });

  const output = sql.slice(sql.lastIndexOf('organization_resolution AS MATERIALIZED'));
  assert.doesNotMatch(output, /ANY\(coalesce\(cm\.organization_ids,hm\.organization_ids\)\)/);
  assert.doesNotMatch(output, /CANONICAL_MODEL|HISTORICAL_SOURCE_RULE/);
});

test('non-CIDEF organization scopes preserve canonical and historical resolution', () => {
  for (const scope of ['INDUMOTORA', 'MACO_TATTERSALL']) {
    const sql = rvmOrganizationResolutionCtes({
      organizationScope: scope,
      organizationParam: '$3',
    });

    assert.match(sql, /ANY\(coalesce\(cm\.organization_ids,hm\.organization_ids\)\)/);
    assert.match(sql, /CANONICAL_MODEL/);
    assert.match(sql, /HISTORICAL_SOURCE_RULE/);
  }
});

test('ALL scope remains unfiltered', () => {
  const sql = rvmOrganizationResolutionCtes({ organizationScope: 'ALL' });
  assert.match(sql, /'INCLUDED'::text organization_bucket/);
  assert.match(sql, /'ALL'::text organization_resolution_method/);
});
