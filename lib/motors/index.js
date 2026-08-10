import * as inventario from './import-inventario.js';
import * as notasVenta from './import-notas-venta.js';
import * as estadisticasVenta from './import-estadisticas-venta.js';
import * as listaPrecios from './import-lista-precios.js';

const MOTORS = {
  import_inventario: inventario.run,
  import_notas_venta: notasVenta.run,
  import_estadisticas_venta: estadisticasVenta.run,
  import_lista_precios: listaPrecios.run,
};

export function getMotor(name) {
  return MOTORS[name] || null;
}

export function listMotors() {
  return Object.keys(MOTORS);
}
