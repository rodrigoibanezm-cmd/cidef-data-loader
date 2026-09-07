import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCrmUniverse } from '../lib/crm-universe/buildCrmUniverse.js';

test('brand identity is driven by prepared Producto de interes resolution, never CRM Marca', () => {
  const universe = assembleCrmUniverse([{ lead_id:'1', source_rows:1, product_interest_raw:'Dongfeng Mage', product_interest_norm:'DONGFENG MAGE', brand_match_count:1, model_match_count:1, brand_id:1, brand:'DONGFENG', model_id:10, model:'MAGE', store_raw_norm:null, seller_raw_norm:null }], { commercial_universe:'COMPANY' });
  assert.equal(universe.analytical_events[0].brand, 'DONGFENG');
  assert.equal(universe.analytical_events[0].product_identity_status, 'RESOLVED');
});

test('ambiguous and not-applicable product identities remain explicit', () => {
  const u = assembleCrmUniverse([
    { lead_id:'1', source_rows:2, product_interest_raw:'X', product_interest_norm:'X', brand_match_count:2, model_match_count:2, store_raw_norm:null, seller_raw_norm:null },
    { lead_id:'2', source_rows:2, product_interest_raw:null, product_interest_norm:null, brand_match_count:null, model_match_count:null, store_raw_norm:null, seller_raw_norm:null },
  ], { commercial_universe:'COMPANY' });
  assert.deepEqual(u.analytical_events.map((r)=>r.product_identity_status), ['AMBIGUOUS','NOT_APPLICABLE']);
  assert.equal(u.validation.product_identity_reconciles, true);
});
