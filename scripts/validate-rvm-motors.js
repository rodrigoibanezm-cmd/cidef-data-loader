import assert from 'node:assert/strict';
import { rvmDb } from '../lib/rvm-db.js';
import { run as models } from '../lib/motors/refresh-vehicle-models-master.js';
import { run as versions } from '../lib/motors/refresh-vehicle-versions-master.js';
import { run as classify } from '../lib/motors/classify-electrification.js';
import { run as pareto } from '../lib/motors/rvm-market-pareto.js';
import { run as audit } from '../lib/motors/rvm-quality-audit.js';

const firstModels = await models();
const secondModels = await models();
assert.equal(secondModels.created_models, 0);
const firstVersions = await versions();
const secondVersions = await versions();
assert.equal(secondVersions.created_versions, 0);
assert.equal(secondVersions.updated_versions, 0);

const distribution = await classify();
const secondDistribution = await classify();
assert.deepEqual(secondDistribution, distribution);
assert.deepEqual(Object.keys(distribution), ['ICE','HEV','PHEV','BEV','PENDIENTE']);

const sql = rvmDb();
const [latest] = await sql.query(`SELECT to_char(date_trunc('month',MAX(fecha)),'YYYY-MM') AS period
  FROM rvm_raw WHERE fecha IS NOT NULL`);

for (const universe of ['ALL', 'CHINA']) {
  const result = await pareto({ universe });
  assert.equal(result.period, latest.period);
  for (let i = 1; i < result.rows.length; i++) {
    assert.ok(Number(result.rows[i].acumulado_pct) >= Number(result.rows[i - 1].acumulado_pct));
    assert.equal(Number(result.rows[i].ranking), i + 1);
  }
  if (result.rows.length) {
    const last = Number(result.rows.at(-1).acumulado_pct);
    assert.ok(last >= result.threshold_pct || Math.abs(last - result.threshold_pct) <= 1);
  }
  for (const row of result.rows) {
    assert.equal(typeof row.unidades, 'number');
    assert.equal(typeof row.share_pct, 'number');
    assert.equal(typeof row.acumulado_pct, 'number');
  }
}

const tableCounts = () => sql.query(`SELECT
  (SELECT COUNT(*) FROM rvm_raw)::bigint AS rvm,
  (SELECT COUNT(*) FROM vehicle_models_master)::bigint AS models,
  (SELECT COUNT(*) FROM vehicle_versions_master)::bigint AS versions,
  (SELECT COUNT(*) FROM active_vehicle_models)::bigint AS active`);
const before = await tableCounts();
const quality = await audit();
const after = await tableCounts();
assert.deepEqual(after, before);
assert.equal(Object.keys(quality.checks).length, 10);
console.log(JSON.stringify({ firstModels, firstVersions, distribution, quality }, null, 2));
