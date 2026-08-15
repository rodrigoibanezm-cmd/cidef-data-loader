import { cleanInventoryTable } from '../inventory-cleaning.js';

const TABLE = 'inventario_vehiculos_global_raw';

export async function run() {
  const result = await cleanInventoryTable(TABLE);
  return { table: TABLE, ...result };
}
