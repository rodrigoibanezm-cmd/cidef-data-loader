import { customGptDb } from '../custom-gpt/db.js';
import { assembleCompetitiveContext } from './assembleCompetitiveContext.js';
import { parseCompetitiveInput } from './competitiveInput.js';
import { buildCompetitiveQuery } from './competitiveQuery.js';

export async function buildCompetitiveContext(input = {}) {
  const scope = parseCompetitiveInput(input);
  const sql = customGptDb();
  const query = buildCompetitiveQuery(scope);
  const rows = await sql.query(query.sql, query.params);
  if (rows.length !== 1) throw new Error('Competitive context query did not return one payload');
  const context = assembleCompetitiveContext(scope, rows[0]);
  if (!context.targets.length) throw new Error('No requested model is in the current CIDEF portfolio');
  return context;
}
