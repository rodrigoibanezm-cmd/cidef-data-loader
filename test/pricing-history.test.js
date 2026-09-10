import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPricingHistory, parsePricingHistoryInput } from '../lib/pricing-history/buildPricingHistory.js';

const identity = { version_id: 7176, brand: 'DONGFENG', model: 'MAGE', version: 'MAGE 1.5T E2' };
const base = {
  version_id: 7176, price_version_id: 10, precio_neto: null, precio_lista: 100, precio_con_iva: 119, bono_cidef: null, bono_forum: 10, bono_mes: 5,
  delta_precio_neto: null, delta_precio_lista: null, delta_precio_con_iva: null, delta_bono_cidef: null, delta_bono_forum: null, delta_bono_mes: null,
  source_rows: 2, source_variant_count: 1, source_files: ['a.xlsx'], primer_vin_fecha: null, ultimo_vin_fecha: null,
};
const episodes = [
  { ...base, price_episode_id: 1, vigencia_desde: '2026-01-01', vigencia_hasta: '2026-01-31', tipo_cambio: 'INITIAL', source_status: 'OK', vin_facturados_en_vigencia: 1, primer_vin_fecha:'2026-01-10', ultimo_vin_fecha:'2026-01-10' },
  { ...base, price_episode_id: 2, vigencia_desde: '2026-02-01', vigencia_hasta: '2026-02-28', tipo_cambio: 'PRECIO', source_status: 'OK', precio_lista: 90, delta_precio_lista:-10, vin_facturados_en_vigencia: 4, primer_vin_fecha:'2026-02-05', ultimo_vin_fecha:'2026-02-25' },
  { ...base, price_episode_id: 3, vigencia_desde: '2026-03-01', vigencia_hasta: '2026-03-31', tipo_cambio: 'SOURCE_CONFLICT', source_status: 'SOURCE_CONFLICT', precio_neto:null, precio_lista:null, precio_con_iva:null, bono_cidef:null, bono_forum:null, bono_mes:null, delta_precio_neto:null, delta_precio_lista:null, delta_precio_con_iva:null, delta_bono_cidef:null, delta_bono_forum:null, delta_bono_mes:null, source_variant_count:2, vin_facturados_en_vigencia: 0 },
  { ...base, price_episode_id: 4, vigencia_desde: '2026-04-01', vigencia_hasta: '2026-04-30', tipo_cambio: 'BONO', source_status: 'OK', bono_forum:20, delta_bono_forum:10, vin_facturados_en_vigencia: 1, primer_vin_fecha:'2026-04-15', ultimo_vin_fecha:'2026-04-15' },
  { ...base, price_episode_id: 5, vigencia_desde: '2026-05-01', vigencia_hasta: null, tipo_cambio: 'PRECIO_Y_BONO', source_status: 'OK', precio_lista:95, delta_precio_lista:5, bono_forum:15, delta_bono_forum:-5, vin_facturados_en_vigencia: 1, primer_vin_fecha:'2026-05-20', ultimo_vin_fecha:'2026-05-20' },
];
const vins = [
  { price_episode_id:1, version_id:7176, fecha_factura:'2026-01-10' },
  { price_episode_id:2, version_id:7176, fecha_factura:'2026-02-05' },
  { price_episode_id:2, version_id:7176, fecha_factura:'2026-02-15' },
  { price_episode_id:2, version_id:7176, fecha_factura:'2026-02-20' },
  { price_episode_id:2, version_id:7176, fecha_factura:'2026-02-25' },
  { price_episode_id:4, version_id:7176, fecha_factura:'2026-04-15' },
  { price_episode_id:5, version_id:7176, fecha_factura:'2026-05-20' },
];
function run(input={version_id:7176, include_conflicts:true}, rows=episodes, vinRows=vins) {
  return buildPricingHistory({identity,episodeRows:rows,vinRows},parsePricingHistoryInput(input));
}

test('version_id and textual identity inputs parse deterministically', () => {
  assert.equal(parsePricingHistoryInput({version_id:7176}).versionId,7176);
  const p=parsePricingHistoryInput({brand:'DONGFENG',model:'MAGE',version:'MAGE 1.5T E2'}); assert.equal(p.brand,'DONGFENG');
});
test('date_from/date_to select overlapping episodes', () => { assert.deepEqual(run({version_id:7176,date_from:'2026-02-15',date_to:'2026-03-10'}).history.map(x=>x.price_episode_id),[2,3]); });
test('episode completely inside period is returned', () => { assert.deepEqual(run({version_id:7176,date_from:'2026-01-01',date_to:'2026-01-31'}).history.map(x=>x.price_episode_id),[1]); });
test('episode started before date_from is included and clipped', () => { const x=run({version_id:7176,date_from:'2026-02-15',date_to:'2026-02-18'}).history[0]; assert.deepEqual([x.intersection_from,x.intersection_to],['2026-02-15','2026-02-18']); });
test('episode ending after date_to is included and clipped', () => { const x=run({version_id:7176,date_from:'2026-02-10',date_to:'2026-02-20'}).history[0]; assert.deepEqual([x.intersection_from,x.intersection_to],['2026-02-10','2026-02-20']); });
test('open episode intersects through request date_to', () => { const x=run({version_id:7176,date_from:'2026-05-10',date_to:'2026-06-01'}).history[0]; assert.equal(x.intersection_to,'2026-06-01'); });
test('VIN before date_from and after date_to are excluded', () => { const x=run({version_id:7176,date_from:'2026-02-15',date_to:'2026-02-20'}).history[0]; assert.equal(x.vin_facturados_en_periodo,2); });
test('VIN exactly at date_from and date_to are inclusive', () => { const x=run({version_id:7176,date_from:'2026-02-15',date_to:'2026-02-20'}).history[0]; assert.deepEqual([x.primer_vin_fecha_en_periodo,x.ultimo_vin_fecha_en_periodo],['2026-02-15','2026-02-20']); });
test('partial count differs from full episode count', () => { const x=run({version_id:7176,date_from:'2026-02-15',date_to:'2026-02-20'}).history[0]; assert.equal(x.vin_facturados_en_periodo,2); assert.equal(episodes[1].vin_facturados_en_vigencia,4); });
test('legacy VIN aliases now expose request-period semantics', () => { const x=run({version_id:7176,date_from:'2026-02-15',date_to:'2026-02-20'}).history[0]; assert.deepEqual([x.vin_facturados,x.primer_vin_fecha,x.ultimo_vin_fecha],[2,'2026-02-15','2026-02-20']); });
test('summary reconciles with episode request counts', () => { const r=run({version_id:7176,date_from:'2026-02-01',date_to:'2026-04-30'}); assert.equal(r.summary.vin_facturados_en_periodo,r.history.reduce((s,x)=>s+x.vin_facturados_en_periodo,0)); assert.equal(r.summary.vin_facturados,r.summary.vin_facturados_en_periodo); });
test('SOURCE_CONFLICT remains visible even when include_conflicts is false', () => { assert.equal(run({version_id:7176,date_from:'2026-03-01',date_to:'2026-03-31',include_conflicts:false}).history[0].source_status,'SOURCE_CONFLICT'); });
test('SOURCE_CONFLICT preserves null commercial values and deltas', () => { const x=run({version_id:7176,date_from:'2026-03-01',date_to:'2026-03-31'}).history[0]; for (const k of ['precio_neto','precio_lista','precio_con_iva','bono_cidef','bono_forum','bono_mes','delta_precio_neto','delta_precio_lista','delta_precio_con_iva','delta_bono_cidef','delta_bono_forum','delta_bono_mes']) assert.equal(x[k],null,k); });
test('SOURCE_CONFLICT preserves provenance and has zero VIN', () => { const x=run({version_id:7176,date_from:'2026-03-01',date_to:'2026-03-31'}).history[0]; assert.deepEqual(x.evidence,{source_rows:2,source_variant_count:2,source_files:['a.xlsx']}); assert.equal(x.vin_facturados_en_periodo,0); });
test('NULL commercial semantics are preserved without zero coercion', () => { const x=run({version_id:7176,date_from:'2026-01-01',date_to:'2026-01-31'}).history[0]; assert.equal(x.precio_neto,null); assert.equal(x.bono_cidef,null); });
test('days_active remains full-episode inclusive metadata', () => { const x=run({version_id:7176,date_from:'2026-02-15',date_to:'2026-02-16'}).history[0]; assert.equal(x.days_active,28); assert.equal(run({version_id:7176,date_from:'2026-02-15',date_to:'2026-02-16'}).metrics_scope,'REQUEST_INTERSECTION'); });
test('coverage exposes full canonical episode coverage separately from request VIN metrics', () => { const c=run().coverage; assert.deepEqual([c.episodes_total,c.episodes_ok,c.episodes_conflict,c.vin_assigned],[5,4,1,7]); assert.equal(c.status,'PARTIAL'); });
test('no duplicate episodes', () => { assert.throws(()=>run(undefined,[episodes[0],episodes[0]],[vins[0]]),/DUPLICATE_PRICE_EPISODE/); });
test('chronological ascending order', () => { const shuffled=[episodes[4],episodes[0],episodes[2],episodes[1],episodes[3]]; assert.deepEqual(run(undefined,shuffled).history.map(x=>x.price_episode_id),[1,2,3,4,5]); });
test('period without episodes returns valid empty response', () => { const r=run({version_id:7176,date_from:'2025-01-01',date_to:'2025-01-31'}); assert.deepEqual(r.history,[]); assert.equal(r.summary.vin_facturados_en_periodo,0); });
test('invalid date range is rejected', () => assert.throws(()=>parsePricingHistoryInput({version_id:7176,date_from:'2026-02-02',date_to:'2026-02-01'}),/INVALID_DATE_RANGE/));
test('unsupported request field is rejected', () => assert.throws(()=>parsePricingHistoryInput({version_id:7176,price_final:1}),/UNSUPPORTED_PRICING_HISTORY_FIELD/));
test('VIN reconciliation is enforced against canonical full-episode counts', () => { const bad=episodes.map(x=>x.price_episode_id===1?{...x,vin_facturados_en_vigencia:2}:x); assert.throws(()=>run(undefined,bad),/VIN_RECONCILIATION_FAILED/); });
test('SOURCE_CONFLICT cannot have VIN assigned', () => { const rows=episodes.map(x=>x.price_episode_id===3?{...x,vin_facturados_en_vigencia:1,primer_vin_fecha:'2026-03-05',ultimo_vin_fecha:'2026-03-05'}:x); assert.throws(()=>run(undefined,rows,[...vins,{price_episode_id:3,version_id:7176,fecha_factura:'2026-03-05'}]),/SOURCE_CONFLICT_HAS_VIN/); });
test('published semantics and canonical authorities are explicit', () => { const r=run(); assert.equal(r.commercial_condition_semantics,'PUBLISHED_COMMERCIAL_CONDITION'); assert.equal(r.provenance.vin_count_semantics,'IN_REQUEST_PERIOD'); assert.equal(r.provenance.episode_authority,'price_episode_canonico_v01'); assert.equal(r.provenance.vin_authority,'price_episode_vin_v01'); assert.equal(r.provenance.price_realized_available,false); });
