import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CIDEF_RVM_DETAIL_RAW_BRAND,
  CIDEF_RVM_HISTORICAL_AGGREGATION_SCOPE,
  rvmOrganizationResolutionCtes,
} from '../lib/rvm/rvmOrganizationScopeSql.js';

test('CIDEF organization scope detail is determined exclusively by raw DFM brand', () => {
  assert.equal(CIDEF_RVM_DETAIL_RAW_BRAND, 'DFM');
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

test('CIDEF detail inclusion cannot be granted by canonical membership or historical rules', () => {
  const sql = rvmOrganizationResolutionCtes({
    organizationScope: 'CIDEF',
    organizationParam: '$3',
  });

  const output = sql.slice(sql.lastIndexOf('organization_resolution AS MATERIALIZED'));
  assert.doesNotMatch(output, /ANY\(coalesce\(cm\.organization_ids,hm\.organization_ids\)\)/);
  assert.doesNotMatch(output, /CANONICAL_MODEL|HISTORICAL_SOURCE_RULE/);
});

test('CIDEF historical rules are aggregate-only authority', () => {
  assert.equal(CIDEF_RVM_HISTORICAL_AGGREGATION_SCOPE, 'BRAND_AGGREGATE');
  const sql = rvmOrganizationResolutionCtes({
    organizationScope: 'CIDEF',
    organizationParam: '$3',
  });

  const historical = sql.slice(
    sql.indexOf('historical_organization_membership AS MATERIALIZED'),
    sql.lastIndexOf('organization_resolution AS MATERIALIZED'),
  );
  assert.match(historical, /h\.aggregation_scope='BRAND_AGGREGATE'/);

  const output = sql.slice(sql.lastIndexOf('organization_resolution AS MATERIALIZED'));
  assert.doesNotMatch(output, /HISTORICAL_SOURCE_RULE/);
  assert.doesNotMatch(output, /hm\.organization_ids.*INCLUDED/s);
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
    assert.doesNotMatch(sql, /h\.aggregation_scope='BRAND_AGGREGATE'/);
  }
});

test('ALL scope remains unfiltered', () => {
  const sql = rvmOrganizationResolutionCtes({ organizationScope: 'ALL' });
  assert.match(sql, /'INCLUDED'::text organization_bucket/);
  assert.match(sql, /'ALL'::text organization_resolution_method/);
});
