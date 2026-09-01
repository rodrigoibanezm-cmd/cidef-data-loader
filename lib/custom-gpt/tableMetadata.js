import {
  assertTable,
  CUSTOM_GPT_TABLES,
  MASTER_TABLES,
  RAW_TABLES,
} from './catalog.js';
import { columnsFor, customGptDb } from './db.js';

export async function listTables() {
  return {
    raw: RAW_TABLES,
    master: MASTER_TABLES,
    all: CUSTOM_GPT_TABLES,
  };
}

export async function tableSchema(input) {
  const requested = Array.isArray(input.tables) ? input.tables : [input.table].filter(Boolean);
  if (!requested.length) throw new Error('table or tables is required');
  requested.forEach(assertTable);

  const sql = customGptDb();
  const tables = [];
  for (const table of [...new Set(requested)]) {
    const columns = await columnsFor(sql, table);
    tables.push({
      table,
      columns: columns.map((column) => ({ name: column.column_name, type: column.data_type })),
    });
  }
  return { tables };
}
