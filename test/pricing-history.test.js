import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPricingHistory, parsePricingHistoryInput } from '../lib/pricing-history/buildPricingHistory.js';

const identity = { version_id: 7176, brand: 'DONGFENG', model: 'MAGE', version: 'MAGE 1.5T E2' };
const base = {
  version_id: 7176, precio_neto: null, precio_lista: 100, precio_con_iva: 119, bono_cidef: null, bono_forum: 10, bono_mes: 5,
  delta_precio_neto: null, delta_precio_lista: null, delta_precio_con_iva: null, delta_bono_cidef: null, delta_bono_forum: null, delta_bono_mes: null,
  source_files: ['a.xlsx'], primer_vin_fecha: null, ultimo_vin_fecha: null,
};
const episodes = [
  { ...base, price_episode_id: 1, vigencia_desde: '2026-01-01', vigencia_hasta: '2026-01-31', tipo_cambio: 'INITIAL', source_status: 'OK', vin_facturados_en_vigencia: 1, primer_vin_fecha:'2026-01-10', ultimo_vin_fecha:'2026-01-10' },
  { ...base, price_episode_id: 2, vigencia_desde: '2026-02-01', vigencia_hasta: '2026-02-28', tipo_cambio: 'PRECIO', source_status: 'OK', precio_lista: 90, delta_precio_lista:-10, vin_facturados_en_vigencia: 2, primer_vin_fecha:'2026-02-10', ultimo_vin_fecha:'2026-02-20' },
  { ...base, price_episode_id: 3, vigencia_desde: '2026-03-01', vigencia_hasta: '2026-03-31', tipo_cambio: 'SOURCE_CONFLICT', source_status: 'SOURCE_CONFLICT', precio_lista:null, precio_con_iva:null, bono_forum:null, bono_mes:null, vin_facturados_en_vigencia: 0 },
  { ...base, price_episode_id: 4, vigencia_desde: '2026-04-01', vigencia_hasta: '2026-04-30', tipo_cambio: 'BONO', source_status: 'OK', bono_forum:20, delta_bono_forum:10, vin_facturados_en_vigencia: 1, primer_vin_fecha:'2026-04-15', ultimo_vin_fecha:'2026-04-15' },
  { ...base, price_episode_id: 5, vigencia_desde: '2026-05-01', vigencia_hasta: '2026-05-31', tipo_cambio: 'PRECIO_Y_BONO', source_status: 'OK', precio_lista:95, delta_precio_lista:5, bono_forum:15, delta_bono_forum:-5, vin_facturados_en_vigencia: 0 },
];
const vins = [
  { price_episode_id:1, vin_count:1, primer_vin_fecha:'2026-01-10', ultimo_vin_fecha:'2026-01-10' },
  { price_episode_id:2, vin_count:2, primer_vin_fecha:'2026-02-10', ultimo_vin_fecha:'2026-02-20' },
  { price_episode_id:4, vin_count:1, primer_vin_fecha:'2026-04-15', ultimo_vin_fecha:'2026-04-15' },
];
function run(input={version_id:7176, include_conflicts:true}, rows=episodes) { const parsed=parsePricingHistoryInput(input); return buildPricingHistory({identity,episodeRows:rows,vinRows:vins},parsed); }

test('version_id and textual identity inputs parse deterministically', () => {
  assert.equal(parsePricingHistoryInput({version_id:7176}).versionId,7176);
  const p=parsePricingHistoryInput({brand:'DONGFENG',model:'MAGE',version:'MAGE 1.5T E2'}); assert.equal(p.brand,'DONGFENG');
});
test('date_from/date_to select overlapping episodes', () => { assert.deepEqual(run({version_id:7176,date_from:'2026-02-15',date_to:'2026-03-10',include_conflicts:true}).history.map(x=>x.price_episode_id),[2,3]); });
test('date filters use EPISODE_OVERLAP with FULL_EPISODE metrics when cutting an episode', () => {
  const result=run({version_id:7176,date_from:'2026-02-15',date_to:'2026-02-16',include_conflicts:true});
  assert.equal(result.date_filter_semantics,'EPISODE_OVERLAP');
  assert.equal(result.metrics_scope,'FULL_EPISODE');
  assert.equal(result.history.length,1);
  const x=result.history[0];
  assert.deepEqual([x.vigencia_desde,x.vigencia_hasta,x.days_active],['2026-02-01','2026-02-28',28]);
  assert.deepEqual([x.vin_facturados,x.primer_vin_fecha,x.ultimo_vin_fecha],[2,'2026-02-10','2026-02-20']);
});
test('include_conflicts true preserves conflict without invented values or VIN', () => { const x=run().history.find(x=>x.price_episode_id===3); assert.equal(x.precio_lista,null); assert.equal(x.vin_facturados,0); });
test('include_conflicts false hides conflict from history', () => { assert.equal(run({version_id:7176,include_conflicts:false}).history.some(x=>x.source_status==='SOURCE_CONFLICT'),false); });
test('days_active is inclusive and null semantics preserved', () => { const x=run().history[0]; assert.equal(x.days_active,31); assert.equal(x.precio_neto,null); assert.equal(x.bono_cidef,null); });
test('summary is correct', () => { assert.deepEqual(run().summary,{episodes:5,price_changes:1,bonus_changes:1,combined_changes:1,conflicts:1,vin_facturados:4}); });
test('coverage exposes derivable metrics and explicit unavailable metrics', () => { const c=run().coverage; assert.deepEqual([c.episodes_total,c.episodes_ok,c.episodes_conflict,c.vin_assigned],[5,4,1,4]); assert.equal(c.coverage_ratio,null); assert.equal(c.status,'PARTIAL'); });
test('no duplicate episodes', () => { assert.throws(()=>run(undefined,[episodes[0],episodes[0]]),/DUPLICATE_PRICE_EPISODE/); });
test('chronological ascending order', () => { const shuffled=[episodes[4],episodes[0],episodes[2],episodes[1],episodes[3]]; assert.deepEqual(run(undefined,shuffled).history.map(x=>x.price_episode_id),[1,2,3,4,5]); });
test('VIN reconciliation is enforced against canonical VIN layer', () => { const bad=[...episodes]; bad[0]={...bad[0],vin_facturados_en_vigencia:2}; assert.throws(()=>run(undefined,bad),/VIN_RECONCILIATION_FAILED/); });
test('SOURCE_CONFLICT cannot have VIN assigned', () => { const rows=episodes.map(x=>x.price_episode_id===3?{...x,vin_facturados_en_vigencia:1,primer_vin_fecha:'2026-03-05',ultimo_vin_fecha:'2026-03-05'}:x); const parsed=parsePricingHistoryInput({version_id:7176,include_conflicts:true}); assert.throws(()=>buildPricingHistory({identity,episodeRows:rows,vinRows:[...vins,{price_episode_id:3,vin_count:1,primer_vin_fecha:'2026-03-05',ultimo_vin_fecha:'2026-03-05'}]},parsed),/SOURCE_CONFLICT_HAS_VIN/); });
