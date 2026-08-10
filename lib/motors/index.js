import * as inventario from './import-inventario.js';
import * as notasVenta from './import-notas-venta.js';
import * as estadisticasVenta from './import-estadisticas-venta.js';
import * as listaPrecios from './import-lista-precios.js';
import * as profileTable from './profile-table.js';
import * as queryTable from './query-table.js';
import * as tableSchema from './table-schema.js';
import * as joinTables from './join-tables.js';

const MOTORS = {
  import_inventario: inventario.run,
  import_notas_venta: notasVenta.run,
  import_estadisticas_venta: estadisticasVenta.run,
  import_lista_precios: listaPrecios.run,
  profile_table: profileTable.run,
  query_table: queryTable.run,
  table_schema: tableSchema.run,
  join_tables: joinTables.run,
};

export function getMotor(name) {
  return MOTORS[name] || null;
}

export function listMotors() {
  return Object.keys(MOTORS);
}
