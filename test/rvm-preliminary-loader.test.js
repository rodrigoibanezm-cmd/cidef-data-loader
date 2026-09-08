import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_HEADERS, PRELIMINARY_MAPPING, buildHeaderMap, parsePreliminaryRows, selectLatestPreliminaryFile } from '../lib/rvm-preliminary.js';

function row(number, overrides = {}) {
  const base = Object.fromEntries(REQUIRED_HEADERS.map((header) => [header, '']));
  Object.assign(base, {
    Mes: '9', Día: '5', Semana: '1', Mercado: 'Livianos y Medianos', 'Tipo Original': 'LIVIANO', Tipo: 'SUV',
    'Descripción Tipo': 'SUV', 'Descripción Segmento': 'SUV', Marca: 'FOTON', 'Modelo Homologado': 'X',
    'Modelo Versión': 'X 1.5', 'Año Fabricación': '2026', Región: 'METROPOLITANA', Oficina: 'SANTIAGO', Color: 'BLANCO',
    Combustible: 'GASOLINA', PBV: '2000', 'N° Puertas': '5', 'N° Asientos': '5', Carga: '500',
    'Comuna Adquirente': 'ÑUÑOA', 'Región Adquirente': 'METROPOLITANA', Prenda: 'NO', VIN: `VIN${number}`,
    'N° Chasis': `CH${number}`, 'N° Motor': `M${number}`, Patente: `AA${number}`, Calidad: 'OK',
    'Estado Solicitud': 'APROBADA', 'Segmento Pesados': '', 'Año VIN': '2026', 'País VIN': 'CHINA', Preinscrito: 'NO', cantidad: '1',
  }, overrides);
  return { number, values: REQUIRED_HEADERS.map((header) => base[header]) };
}

const file = { name: 'data_septiembre_2026.xlsx', modifiedTime: '2026-09-08T12:00:00Z' };

test('valid preliminary file parses deterministically', () => {
  const parsed = parsePreliminaryRows([row(2), row(3, { Día: '1', VIN: 'VIN3' })], REQUIRED_HEADERS, file);
  assert.equal(parsed.year, 2026);
  assert.equal(parsed.month, 9);
  assert.equal(parsed.snapshot_date, '2026-09-05');
  assert.equal(parsed.rows.length, 2);
});

test('missing required header fails', () => {
  assert.throws(() => buildHeaderMap(REQUIRED_HEADERS.filter((header) => header !== 'Mercado')), /missing columns: Mercado/);
});

test('additional segment filter fails', () => {
  assert.throws(() => parsePreliminaryRows([row(2, { 'Segmento Pesados': 'Camioneta' })], REQUIRED_HEADERS, file), /Additional segment filter/);
});

test('Total and Filtros aplicados rows are discarded', () => {
  const total = row(3, { Mes: 'Total', Mercado: '', VIN: '', cantidad: '6792' });
  const filter = row(4, { Mes: 'Filtros aplicados: Mercado = Livianos y Medianos', Mercado: '', VIN: '', cantidad: '' });
  const parsed = parsePreliminaryRows([row(2), total, filter], REQUIRED_HEADERS, file);
  assert.equal(parsed.rows.length, 1);
});

test('data status and snapshot semantics are exact constants at mapping boundary', () => {
  const parsed = parsePreliminaryRows([row(2)], REQUIRED_HEADERS, file);
  assert.equal(parsed.snapshot_date, parsed.max_date);
  assert.equal(parsed.rows[0].fecha, '2026-09-05');
});

test('column mapping preserves exact target names', () => {
  assert.equal(PRELIMINARY_MAPPING.modelo_version, 'modeo_version');
  assert.equal(PRELIMINARY_MAPPING.comuna_adquirente, 'comuna_adquisicion');
  assert.equal(PRELIMINARY_MAPPING.region_adquirente, 'region_propietario');
});

test('more than one month fails', () => {
  assert.throws(() => parsePreliminaryRows([row(2), row(3, { Mes: '8' })], REQUIRED_HEADERS, file), /more than one month/);
});

test('no valid rows fails', () => {
  const empty = { number: 2, values: REQUIRED_HEADERS.map(() => '') };
  assert.throws(() => parsePreliminaryRows([empty], REQUIRED_HEADERS, file), /no valid data rows/);
});

test('invalid quantity fails', () => {
  assert.throws(() => parsePreliminaryRows([row(2, { cantidad: '1.5' })], REQUIRED_HEADERS, file), /Invalid cantidad/);
});

test('invalid date fails', () => {
  assert.throws(() => parsePreliminaryRows([row(2, { Día: '31', Mes: '2' })], REQUIRED_HEADERS, file), /Invalid derived date/);
});

test('latest data file selection is deterministic', () => {
  const selected = selectLatestPreliminaryFile([
    { name: 'data_old.xlsx', modifiedTime: '2026-09-01T00:00:00Z' },
    { name: 'RVM_2026.xlsx', modifiedTime: '2026-09-09T00:00:00Z' },
    { name: 'data_new.xlsm', modifiedTime: '2026-09-08T00:00:00Z' },
  ]);
  assert.equal(selected.name, 'data_new.xlsm');
});
