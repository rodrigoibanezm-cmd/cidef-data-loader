export async function resolveAvailability(temporal, options = {}) {
  if (options.provider) return options.provider(temporal);
  let sql = options.sql;
  if (!sql) {
    const { customGptDb } = await import('../custom-gpt/db.js');
    sql = customGptDb();
  }
  try {
    const rows = await sql.query(`SELECT
      (SELECT max(fecha_factura)::date FROM public.commercial_operation_master_v01 WHERE vin IS NOT NULL) AS result_through,
      (SELECT max(fecha) FROM public.rvm_raw WHERE data_status='CONSOLIDATED') AS market_consolidated_through,
      (SELECT max(snapshot_date) FROM public.rvm_raw WHERE data_status='PRELIMINARY') AS market_preliminary_through`);
    const row = rows[0] ?? {};
    const resultThrough = row.result_through ? String(row.result_through).slice(0,10) : null;
    const consolidatedThrough = row.market_consolidated_through ? String(row.market_consolidated_through).slice(0,10) : null;
    const preliminaryThrough = row.market_preliminary_through ? String(row.market_preliminary_through).slice(0,10) : null;
    const targetEnd = temporal?.date_to ?? null;
    const marketThrough = [preliminaryThrough, consolidatedThrough].filter(Boolean).sort().at(-1) ?? null;
    return {
      current_result: { available: Boolean(resultThrough), through: resultThrough },
      market_comparison: { available: Boolean(targetEnd && marketThrough && marketThrough >= targetEnd), through: marketThrough },
      historical_comparison: { available: Boolean(consolidatedThrough), through: consolidatedThrough },
    };
  } catch {
    return {
      current_result: { available: null, through: null },
      market_comparison: { available: null, through: null },
      historical_comparison: { available: null, through: null },
    };
  }
}
