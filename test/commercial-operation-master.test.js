import test from 'node:test';
import assert from 'node:assert/strict';
import { __test } from '../lib/motors/commercial-operation-master-v01.js';

test('commercial operation master keeps the five observable statuses and excludes projection', () => {
  const sql = __test.buildSourceSql('$1');
  for (const status of ['FORUM_ONLY','CRM_ONLY','FORUM_CRM','CRM_VIN','FORUM_CRM_VIN']) {
    assert.match(sql, new RegExp(status));
  }
  assert.match(sql, /forum_operacion_canonica_v01/);
  assert.match(sql, /forum_crm_vin_bridge_v01/);
  assert.match(sql, /crm_cidef_venta_link_v01/);
  assert.match(sql, /vehiculo_canonico/);
  assert.doesNotMatch(sql, /weekly_sales_projection/i);
});

test('consensus identity returns null when certified source identities disagree', () => {
  const sql = __test.consensus3('forum_id', 'crm_id', 'vin_id');
  assert.match(sql, /forum_id<>crm_id/);
  assert.match(sql, /forum_id<>vin_id/);
  assert.match(sql, /crm_id<>vin_id/);
  assert.match(sql, /THEN NULL ELSE coalesce\(forum_id,crm_id,vin_id\) END/);
});

test('source SQL preserves Forum to CRM cardinality instead of deduplicating Forum operations', () => {
  const sql = __test.buildSourceSql('$1');
  assert.match(sql, /bridge_cardinality/);
  assert.match(sql, /crm_forum_match_count/);
  assert.match(sql, /MANY_FORUM_TO_ONE_CRM/);
  assert.match(sql, /'FORUM:'\|\|f\.numero_operacion::text/);
  assert.match(sql, /'CRM:'\|\|c\.lead_id::text/);
});
