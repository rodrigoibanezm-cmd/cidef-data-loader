import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { parseForumWorkbook } from '../lib/motors/import-forum.js';

function workbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Forum');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const base = {
  Rut: '11111111-1',
  NumOperacion: 1001,
  NombreCompleto: 'Cliente Prueba',
  EstadoFinalRevision: 'REVISADO',
  EstadoFinal: 'COTIZACION',
  FechaCotizacion: new Date('2026-08-01T12:00:00Z'),
  MarcaVehiculo: 'FOTON',
  ModeloVehiculo: 'TUNLAND',
  EstadoVehiculo: 'NUEVO',
  Distribuidor: 'CIDEF',
  Sucursal: 'PLAZA NORTE',
  Vendedor: 'VENDEDOR PRUEBA',
  Ejecutivo: 'EJECUTIVO PRUEBA',
};

test('parseForumWorkbook normalizes NumOperacion and preserves one row per operation', () => {
  const parsed = parseForumWorkbook(workbookBuffer([
    base,
    { ...base, NumOperacion: 1002, EstadoFinal: 'APROBADO' },
  ]));

  assert.equal(parsed.rowsRead, 2);
  assert.equal(parsed.duplicateOperations, 0);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].numero_operacion, '1001');
});

test('parseForumWorkbook removes duplicate operations keeping the last occurrence', () => {
  const parsed = parseForumWorkbook(workbookBuffer([
    base,
    { ...base, EstadoFinal: 'APROBADO' },
  ]));

  assert.equal(parsed.rowsRead, 2);
  assert.equal(parsed.duplicateOperations, 1);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].estado_final, 'APROBADO');
});

test('parseForumWorkbook rejects missing NumOperacion', () => {
  assert.throws(
    () => parseForumWorkbook(workbookBuffer([{ ...base, NumOperacion: null }])),
    /empty NumOperacion/,
  );
});
