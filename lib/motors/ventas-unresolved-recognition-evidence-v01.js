import { neon } from '@neondatabase/serverless';
import { parseFechaFactura } from './ventas-monthly-dedup-sensitivity-v01.js';

export const ENGINE_NAME = 'ventas_unresolved_recognition_evidence_v01';
export const ENGINE_VERSION = '0.1';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEFAULT_START_MONTH = '2021-01';
const DEFAULT_END_MONTH = '2026-07';
const DEFAULT_DOMINANT_FIRST_CUSTOMERS = Object.freeze(['77050575', '96800910', '96726670']);
const EXAMPLE_LIMIT = 20;

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

function normalizeMonth(value, fallback, name) {
  const month = String(value || fallback);
  if (!MONTH_RE.test(month)) throw new Error(`${name} must use YYYY-MM`);
  return month;
}

function monthOrdinal(month) {
  const [year, m] = month.split('-').map(Number);
  return year * 12 + m - 1;
}

function inWindow(month, startMonth, endMonth) {
  const value = monthOrdinal(month);
  return value >= monthOrdinal(startMonth) && value <= monthOrdinal(endMonth);
}

function normalizedText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function normalizedVin(value) {
  return normalizedText(value);
}

function stableId(value) {
  return value == null ? '' : String(value);
}

function compareStableId(a, b) {
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return String(a).localeCompare(String(b));
}

function normalizeDominantCustomers(value) {
  const source = Array.isArray(value) && value.length ? value : DEFAULT_DOMINANT_FIRST_CUSTOMERS;
  const normalized = [...new Set(source.map(normalizedText).filter(Boolean))];
  if (!normalized.length) throw new Error('dominant_first_customers must contain at least one non-empty customer');
  return normalized;
}

function addToMapList(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topValues(map, denominator = null, limit = 20) {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count, pct: denominator ? count / denominator : null }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))
    .slice(0, limit);
}

function invoiceTokens(row, fields) {
  return new Set(fields.map((field) => normalizedText(row?.[field])).filter(Boolean));
}

function setsOverlap(a, b) {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function parsedTime(value) {
  const parsed = parseFechaFactura(value);
  return parsed && !parsed.error ? parsed.date.getTime() : null;
}

function eventEvidenceAgainstNote(event, note) {
  const eventInvoices = invoiceTokens(event, ['factura', 'nro_factura']);
  const noteInvoices = invoiceTokens(note, ['factura']);
  const operation = normalizedText(event.nro_operacion);
  const noteOperation = normalizedText(note.nro_operacion);
  const eventTime = parsedTime(event.fecha_factura);
  const noteTime = parsedTime(note.fecha_factura);
  return {
    operation: Boolean(operation && noteOperation && operation === noteOperation),
    invoice: setsOverlap(eventInvoices, noteInvoices),
    fecha_factura: eventTime != null && noteTime != null && eventTime === noteTime,
  };
}

function eventEvidenceAgainstVehicle(event, vehicle) {
  const eventInvoices = invoiceTokens(event, ['factura', 'nro_factura']);
  const vehicleInvoices = invoiceTokens(vehicle, ['factura', 'numero_factura']);
  const eventTime = parsedTime(event.fecha_factura);
  const vehicleTime = parsedTime(vehicle.fecha_factura);
  return {
    invoice: setsOverlap(eventInvoices, vehicleInvoices),
    fecha_factura: eventTime != null && vehicleTime != null && eventTime === vehicleTime,
    cliente: Boolean(normalizedText(event.cliente) && normalizedText(vehicle.cliente) && normalizedText(event.cliente) === normalizedText(vehicle.cliente)),
  };
}

function anyIdentityEvidence(evidence) {
  return Boolean(evidence.operation || evidence.invoice || evidence.fecha_factura);
}

function anyVehicleEventEvidence(evidence) {
  return Boolean(evidence.invoice || evidence.fecha_factura);
}

function classifyPresence(firstPresent, lastPresent) {
  if (firstPresent && lastPresent) return 'both';
  if (firstPresent) return 'first_only';
  if (lastPresent) return 'last_only';
  return 'neither';
}

function strongestMatchingNotes(notes, event) {
  const scored = notes.map((note) => {
    const evidence = eventEvidenceAgainstNote(event, note);
    const score = evidence.operation ? 3 : evidence.invoice ? 2 : evidence.fecha_factura ? 1 : 0;
    return { note, evidence, score };
  }).filter((row) => row.score > 0);
  if (!scored.length) return [];
  const maxScore = Math.max(...scored.map((row) => row.score));
  return scored.filter((row) => row.score === maxScore);
}

function noteStatusSnapshot(matches) {
  if (!matches.length) return { matched_rows: 0, match_basis: null, top: {} };
  const basis = matches[0].evidence.operation ? 'nro_operacion' : matches[0].evidence.invoice ? 'factura' : 'fecha_factura';
  const fields = ['tiene_operacion', 'esta_autorizado', 'esta_pendiente_entrega', 'etapa'];
  const top = {};
  for (const field of fields) {
    const counts = new Map();
    for (const { note } of matches) increment(counts, normalizedText(note[field]) ?? '<NULL>');
    top[field] = topValues(counts, matches.length, 10);
  }
  return { matched_rows: matches.length, match_basis: basis, top };
}

function eventSummary(row, month) {
  return {
    month,
    fecha_factura: row.fecha_factura ?? null,
    cliente: row.cliente ?? null,
    razon_social: row.razon_social ?? null,
    nro_operacion: row.nro_operacion ?? null,
    factura: row.factura ?? null,
    nro_factura: row.nro_factura ?? null,
  };
}

export function calculateVentasUnresolvedRecognitionEvidence(ventasRows, notasRows, vehiculosRows, input = {}) {
  const startMonth = normalizeMonth(input.start_month, DEFAULT_START_MONTH, 'start_month');
  const endMonth = normalizeMonth(input.end_month, DEFAULT_END_MONTH, 'end_month');
  if (monthOrdinal(endMonth) < monthOrdinal(startMonth)) throw new Error('end_month must be >= start_month');
  const dominantCustomers = normalizeDominantCustomers(input.dominant_first_customers);
  const dominantSet = new Set(dominantCustomers);

  const byVin = new Map();
  let ventasParseErrors = 0;
  let ventasNullFechaRows = 0;
  for (const row of ventasRows) {
    const vin = normalizedVin(row.nro_vin_chasis);
    if (!vin) continue;
    if (!byVin.has(vin)) byVin.set(vin, { rows: [], dateError: false });
    const entry = byVin.get(vin);
    const parsed = parseFechaFactura(row.fecha_factura);
    if (parsed == null) {
      ventasNullFechaRows += 1;
      entry.dateError = true;
      continue;
    }
    if (parsed.error) {
      ventasParseErrors += 1;
      entry.dateError = true;
      continue;
    }
    entry.rows.push({ ...row, __parsed: parsed, __id: stableId(row.id) });
  }

  const unresolved = [];
  let crossMonthVins = 0;
  let resolvedCrossMonthVins = 0;
  let excludedVinsWithDateErrors = 0;
  let crossMonthTieVins = 0;

  for (const [vin, entry] of byVin.entries()) {
    if (entry.dateError || !entry.rows.length) {
      excludedVinsWithDateErrors += 1;
      continue;
    }
    const rows = entry.rows.slice().sort((a, b) => a.__parsed.date - b.__parsed.date || compareStableId(a.__id, b.__id));
    if (rows.length < 2) continue;
    const firstTime = rows[0].__parsed.date.getTime();
    const lastTime = rows[rows.length - 1].__parsed.date.getTime();
    const firstCandidates = rows.filter((row) => row.__parsed.date.getTime() === firstTime).sort((a, b) => compareStableId(a.__id, b.__id));
    const lastCandidates = rows.filter((row) => row.__parsed.date.getTime() === lastTime).sort((a, b) => compareStableId(a.__id, b.__id));
    const first = firstCandidates[0];
    const last = lastCandidates[0];
    if (first.__parsed.month === last.__parsed.month) continue;

    crossMonthVins += 1;
    if (firstCandidates.length > 1 || lastCandidates.length > 1) crossMonthTieVins += 1;
    const firstCustomer = normalizedText(first.cliente);
    if (dominantSet.has(firstCustomer)) {
      resolvedCrossMonthVins += 1;
      continue;
    }
    if (!inWindow(first.__parsed.month, startMonth, endMonth) && !inWindow(last.__parsed.month, startMonth, endMonth)) continue;
    unresolved.push({ vin, first, last, firstCandidates, lastCandidates });
  }

  const notasByVin = new Map();
  for (const row of notasRows) {
    const vin = normalizedVin(row.chasis);
    if (vin) addToMapList(notasByVin, vin, row);
  }
  const vehiculosByVin = new Map();
  for (const row of vehiculosRows) {
    const vin = normalizedVin(row.vin_chasis);
    if (vin) addToMapList(vehiculosByVin, vin, row);
  }

  const notePresence = new Map();
  const vehiclePresence = new Map();
  const vehicleInvoiceAlignment = new Map();
  const vehicleDateAlignment = new Map();
  const vehicleCustomerAlignment = new Map();
  const vehicleEtapaByAlignment = { first_only: new Map(), last_only: new Map(), both: new Map(), neither: new Map() };
  const vehicleVigenteByAlignment = { first_only: new Map(), last_only: new Map(), both: new Map(), neither: new Map() };
  const vehiclePendienteByAlignment = { first_only: new Map(), last_only: new Map(), both: new Map(), neither: new Map() };
  const firstNoteStatusMaps = Object.fromEntries(['tiene_operacion', 'esta_autorizado', 'esta_pendiente_entrega', 'etapa'].map((f) => [f, new Map()]));
  const lastNoteStatusMaps = Object.fromEntries(['tiene_operacion', 'esta_autorizado', 'esta_pendiente_entrega', 'etapa'].map((f) => [f, new Map()]));

  let notasCoveredVins = 0;
  let vehiculosCoveredVins = 0;
  let currentSnapshotFirstOnly = 0;
  let currentSnapshotLastOnly = 0;
  let currentSnapshotBoth = 0;
  let currentSnapshotNeither = 0;
  const records = [];

  for (const record of unresolved) {
    const notes = notasByVin.get(record.vin) || [];
    const vehicles = vehiculosByVin.get(record.vin) || [];
    if (notes.length) notasCoveredVins += 1;
    if (vehicles.length) vehiculosCoveredVins += 1;

    const firstNoteMatches = strongestMatchingNotes(notes, record.first);
    const lastNoteMatches = strongestMatchingNotes(notes, record.last);
    const firstNotePresent = firstNoteMatches.length > 0;
    const lastNotePresent = lastNoteMatches.length > 0;
    const noteCategory = classifyPresence(firstNotePresent, lastNotePresent);
    increment(notePresence, noteCategory);

    for (const { note } of firstNoteMatches) {
      for (const field of Object.keys(firstNoteStatusMaps)) increment(firstNoteStatusMaps[field], normalizedText(note[field]) ?? '<NULL>');
    }
    for (const { note } of lastNoteMatches) {
      for (const field of Object.keys(lastNoteStatusMaps)) increment(lastNoteStatusMaps[field], normalizedText(note[field]) ?? '<NULL>');
    }

    let vehicleFirstEvent = false;
    let vehicleLastEvent = false;
    let vehicleFirstInvoice = false;
    let vehicleLastInvoice = false;
    let vehicleFirstDate = false;
    let vehicleLastDate = false;
    let vehicleFirstCustomer = false;
    let vehicleLastCustomer = false;

    for (const vehicle of vehicles) {
      const firstEvidence = eventEvidenceAgainstVehicle(record.first, vehicle);
      const lastEvidence = eventEvidenceAgainstVehicle(record.last, vehicle);
      vehicleFirstEvent ||= anyVehicleEventEvidence(firstEvidence);
      vehicleLastEvent ||= anyVehicleEventEvidence(lastEvidence);
      vehicleFirstInvoice ||= firstEvidence.invoice;
      vehicleLastInvoice ||= lastEvidence.invoice;
      vehicleFirstDate ||= firstEvidence.fecha_factura;
      vehicleLastDate ||= lastEvidence.fecha_factura;
      vehicleFirstCustomer ||= firstEvidence.cliente;
      vehicleLastCustomer ||= lastEvidence.cliente;
    }

    const vehicleCategory = classifyPresence(vehicleFirstEvent, vehicleLastEvent);
    const invoiceCategory = classifyPresence(vehicleFirstInvoice, vehicleLastInvoice);
    const dateCategory = classifyPresence(vehicleFirstDate, vehicleLastDate);
    const customerCategory = classifyPresence(vehicleFirstCustomer, vehicleLastCustomer);
    increment(vehiclePresence, vehicleCategory);
    increment(vehicleInvoiceAlignment, invoiceCategory);
    increment(vehicleDateAlignment, dateCategory);
    increment(vehicleCustomerAlignment, customerCategory);

    if (vehicleCategory === 'first_only') currentSnapshotFirstOnly += 1;
    else if (vehicleCategory === 'last_only') currentSnapshotLastOnly += 1;
    else if (vehicleCategory === 'both') currentSnapshotBoth += 1;
    else currentSnapshotNeither += 1;

    for (const vehicle of vehicles) {
      increment(vehicleEtapaByAlignment[vehicleCategory], normalizedText(vehicle.etapa) ?? '<NULL>');
      increment(vehicleVigenteByAlignment[vehicleCategory], normalizedText(vehicle.vigente) ?? '<NULL>');
      increment(vehiclePendienteByAlignment[vehicleCategory], normalizedText(vehicle.pendiente_entrega) ?? '<NULL>');
    }

    records.push({
      vin: record.vin,
      first: eventSummary(record.first, record.first.__parsed.month),
      last: eventSummary(record.last, record.last.__parsed.month),
      extreme_tie: record.firstCandidates.length > 1 || record.lastCandidates.length > 1,
      notas: {
        rows: notes.length,
        event_presence: noteCategory,
        first: noteStatusSnapshot(firstNoteMatches),
        last: noteStatusSnapshot(lastNoteMatches),
      },
      vehiculos: {
        rows: vehicles.length,
        event_alignment: vehicleCategory,
        invoice_alignment: invoiceCategory,
        fecha_factura_alignment: dateCategory,
        cliente_alignment: customerCategory,
        current: vehicles.slice(0, 3).map((vehicle) => ({
          factura: vehicle.factura ?? null,
          numero_factura: vehicle.numero_factura ?? null,
          fecha_factura: vehicle.fecha_factura ?? null,
          cliente: vehicle.cliente ?? null,
          vigente: vehicle.vigente ?? null,
          etapa: vehicle.etapa ?? null,
          pendiente_entrega: vehicle.pendiente_entrega ?? null,
          nota_de_venta: vehicle.nota_de_venta ?? null,
        })),
      },
    });
  }

  const unresolvedVins = unresolved.length;
  const noteStatusSummary = (maps) => Object.fromEntries(Object.entries(maps).map(([field, map]) => [field, topValues(map, [...map.values()].reduce((a, b) => a + b, 0), 20)]));
  const vehicleStatusSummary = (group) => Object.fromEntries(Object.entries(group).map(([alignment, map]) => [alignment, topValues(map, [...map.values()].reduce((a, b) => a + b, 0), 20)]));

  const warnings = [];
  if (ventasParseErrors) warnings.push(`${ventasParseErrors} ventas_raw rows have unparseable fecha_factura`);
  if (ventasNullFechaRows) warnings.push(`${ventasNullFechaRows} ventas_raw rows have null/blank fecha_factura`);
  if (excludedVinsWithDateErrors) warnings.push(`${excludedVinsWithDateErrors} non-null VINs have date errors and were excluded before FIRST/LAST classification`);
  if (crossMonthTieVins) warnings.push(`${crossMonthTieVins} cross-month VINs have an extreme-date tie; lowest id is technical tie-break only`);

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: warnings.length ? 'warning' : 'ok',
    inputs: {
      start_month: startMonth,
      end_month: endMonth,
      dominant_first_customers: dominantCustomers,
    },
    policy: {
      target_universe: 'cross-month VINs not covered by dominant FIRST-customer rule',
      first_last_scope: 'global ventas_raw snapshot',
      window_application: 'include target VIN when FIRST or LAST is inside requested window',
      notes_semantics: 'presence/status evidence only; notas_venta_raw may preserve process history and does not by itself prove validity',
      vehicle_semantics: 'current vehiculos_raw snapshot alignment is persistence evidence, not automatic proof of commercial recognition',
      event_identity_in_notas: 'strongest exact match priority: nro_operacion > factura > fecha_factura',
      event_identity_in_vehiculos: 'exact factura/numero_factura or exact fecha_factura; cliente reported separately and not used as event identity',
    },
    coverage: {
      ventas_rows: ventasRows.length,
      notas_rows_loaded_for_target: notasRows.length,
      vehiculos_rows_loaded_for_target: vehiculosRows.length,
      cross_month_vins: crossMonthVins,
      resolved_cross_month_vins: resolvedCrossMonthVins,
      unresolved_vins: unresolvedVins,
      unresolved_pct_cross_month: crossMonthVins ? unresolvedVins / crossMonthVins : null,
      notas_covered_vins: notasCoveredVins,
      notas_coverage_pct: unresolvedVins ? notasCoveredVins / unresolvedVins : null,
      vehiculos_covered_vins: vehiculosCoveredVins,
      vehiculos_coverage_pct: unresolvedVins ? vehiculosCoveredVins / unresolvedVins : null,
      ventas_parse_errors: ventasParseErrors,
      ventas_null_fecha_rows: ventasNullFechaRows,
      excluded_vins_with_date_errors: excludedVinsWithDateErrors,
      cross_month_extreme_tie_vins: crossMonthTieVins,
    },
    notas_evidence: {
      event_presence: Object.fromEntries(['first_only', 'last_only', 'both', 'neither'].map((key) => [key, notePresence.get(key) || 0])),
      first_match_status: noteStatusSummary(firstNoteStatusMaps),
      last_match_status: noteStatusSummary(lastNoteStatusMaps),
    },
    vehiculos_evidence: {
      event_alignment: {
        first_only: currentSnapshotFirstOnly,
        last_only: currentSnapshotLastOnly,
        both: currentSnapshotBoth,
        neither: currentSnapshotNeither,
      },
      invoice_alignment: Object.fromEntries(['first_only', 'last_only', 'both', 'neither'].map((key) => [key, vehicleInvoiceAlignment.get(key) || 0])),
      fecha_factura_alignment: Object.fromEntries(['first_only', 'last_only', 'both', 'neither'].map((key) => [key, vehicleDateAlignment.get(key) || 0])),
      cliente_alignment: Object.fromEntries(['first_only', 'last_only', 'both', 'neither'].map((key) => [key, vehicleCustomerAlignment.get(key) || 0])),
      etapa_by_event_alignment: vehicleStatusSummary(vehicleEtapaByAlignment),
      vigente_by_event_alignment: vehicleStatusSummary(vehicleVigenteByAlignment),
      pendiente_entrega_by_event_alignment: vehicleStatusSummary(vehiclePendienteByAlignment),
    },
    decision_evidence: {
      current_snapshot_points_first_only: currentSnapshotFirstOnly,
      current_snapshot_points_last_only: currentSnapshotLastOnly,
      current_snapshot_points_both: currentSnapshotBoth,
      current_snapshot_points_neither: currentSnapshotNeither,
      note: 'These are evidence counts, not an automatic FIRST/LAST business rule.',
    },
    unresolved_records: records,
    examples: records.slice(0, EXAMPLE_LIMIT),
    validation: {
      cross_partition_ok: resolvedCrossMonthVins + unresolvedVins === crossMonthVins,
      target_records_match_unresolved: records.length === unresolvedVins,
    },
    warnings,
  };
}

function placeholders(count) {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(', ');
}

export async function ventasUnresolvedRecognitionEvidenceV01(input = {}) {
  const sql = db();
  const ventasRows = await sql.query(`
    SELECT id, nro_vin_chasis, fecha_factura, cliente, razon_social,
           nro_operacion, factura, nro_factura
    FROM ventas_raw
  `);

  // First pass derives the target VIN set deterministically from ventas_raw only.
  const preliminary = calculateVentasUnresolvedRecognitionEvidence(ventasRows, [], [], input);
  const vins = preliminary.unresolved_records.map((record) => record.vin);
  if (!vins.length) return preliminary;

  const p = placeholders(vins.length);
  const [notasRows, vehiculosRows] = await Promise.all([
    sql.query(`
      SELECT chasis, nro_operacion, nota_de_venta, fecha_nota_de_venta, fecha_creacion_nv,
             tiene_operacion, esta_autorizado, esta_pendiente_entrega, etapa,
             razon_social, cliente, factura, fecha_factura
      FROM notas_venta_raw
      WHERE NULLIF(TRIM(chasis), '') IN (${p})
    `, vins),
    sql.query(`
      SELECT vin_chasis, vigente, etapa, nota_de_venta, factura, numero_factura,
             fecha_factura, cliente, pendiente_entrega
      FROM vehiculos_raw
      WHERE NULLIF(TRIM(vin_chasis), '') IN (${p})
    `, vins),
  ]);

  return calculateVentasUnresolvedRecognitionEvidence(ventasRows, notasRows, vehiculosRows, input);
}
