import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCrmUniverse } from '../lib/crm-universe/buildCrmUniverse.js';
import { parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';

test('COMPANY keeps unresolved store identity and OWN_STORES admits only resolved CIDEF stores', () => {
  const rows = [
    { lead_id:'1', source_rows:3, store_raw:'Bellavista',store_raw_norm:'BELLAVISTA',store_match_count:1,sucursal_id:7,sucursal_nombre:'BELLAVISTA',tipo_canal:'CIDEF',product_interest_norm:null,seller_raw_norm:null },
    { lead_id:'2', source_rows:3, store_raw:'Dealer X',store_raw_norm:'DEALER X',store_match_count:1,sucursal_id:70,sucursal_nombre:'DEALER X',tipo_canal:'DEALER',product_interest_norm:null,seller_raw_norm:null },
    { lead_id:'3', source_rows:3, store_raw:'Automotora Austral',store_raw_norm:'AUTOMOTORA AUSTRAL',store_match_count:null,sucursal_id:null,tipo_canal:null,product_interest_norm:null,seller_raw_norm:null },
  ];
  const company=assembleCrmUniverse(rows,{commercial_universe:'COMPANY'}); const own=assembleCrmUniverse(rows,{commercial_universe:'OWN_STORES'});
  assert.equal(company.analytical_events.length,3); assert.equal(own.analytical_events.length,1);
  assert.equal(company.coverage.commercial_universe.resolved_other_universe,1); assert.equal(company.coverage.commercial_universe.unresolved,1);
});

test('DEALERS and STORE/SELLER domain restrictions remain explicit', () => {
  const base={commercial_universe:'COMPANY',metric:'LEADS_CREATED',grain:'TOTAL',mode:'EVENT',date_axis:'CREATED_AT',date_from:'2026-01-01',date_to:'2026-01-31',time_grain:'MONTH'};
  assert.throws(()=>parseCrmLongitudinalInput({...base,commercial_universe:'DEALERS'}),/UNSUPPORTED_COMMERCIAL_UNIVERSE/);
  assert.throws(()=>parseCrmLongitudinalInput({...base,grain:'STORE'}),/DOMAIN_MISMATCH/);
});
