import { neon } from '@neondatabase/serverless';
import { executeVinOlap } from './vin-engine.js';
import { buildSourceQuery, buildDealerMasterQuery } from './vin-query-builder.js';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

export async function run(input = {}) {
  const sql = db();
  const sourceRows = await sql.query(buildSourceQuery());
  const needsDealerMaster = (input.dimensions || []).some((d) => d.name === 'dealer_sale' && d.level === 'canonical') ||
    (input.filters || []).some((f) => f.field === 'dealer_sale' && f.level === 'canonical');
  const dealerRows = needsDealerMaster ? await sql.query(buildDealerMasterQuery()) : [];
  return executeVinOlap(input, sourceRows, dealerRows);
}

export { executeVinOlap } from './vin-engine.js';
