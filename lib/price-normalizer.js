const VERSION_FIELDS = [
  'linea_midi', 'linea_tm3', 'linea_tm5', 'wonder_2', 'linea_k1', 'linea_ft',
  'foton_g7_lite_euro_6', 'foton_g7_ultimate_euro_6', 'foton_g7_ultimate_at_euro_6',
  'g9_mt', 'g9_2', 'foton_v7_euro_6', 'foton_v9_euro_6',
  'aeolus_y3_2', 'aeolus_gs_2', 't5_2', 't5_l', 't5_evo_2', 'sx6_2',
  'mage_2', 'mage_3', 'huge_2', 'precio_rich_6',
  'view_grand_cargo', 'view_grand_pasajero', 'g7_ev', 's50_ev',
];

const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function parseVigencia(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function parseClp(value) {
  const text = cleanText(value);
  if (!text || /^\$?\s*-\s*$/.test(text)) return null;
  if (/[A-Za-z]/.test(text)) return null;
  const negative = /^\$?\s*\(/.test(text);
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? (negative ? -amount : amount) : null;
}

function brandFor(record) {
  const sheet = cleanText(record.source_sheet).toUpperCase();
  if (sheet.startsWith('FOTON')) return 'FOTON';
  if (sheet.startsWith('DONGFENG')) return 'DONGFENG';
  const brand = cleanText(record.marca).toUpperCase();
  return brand || null;
}

function firstVersion(record) {
  for (const key of VERSION_FIELDS) {
    const value = cleanText(record[key]);
    if (value) return value;
  }
  return null;
}

export function normalizePriceRecord(record) {
  const marca = brandFor(record);
  let modelo = cleanText(record.product_group || record.modelo);
  let version = firstVersion(record);

  if (!modelo && record.modelo) modelo = cleanText(record.modelo);
  if (!version && record.modelo) {
    const transmission = cleanText(record.transmision || record.transm);
    version = transmission ? `${modelo} ${transmission}` : modelo;
  }

  const vigenciaDesde = parseVigencia(record.vigencia);
  if (!marca || !modelo || !version || !vigenciaDesde) return null;

  return {
    marca,
    modelo,
    version,
    vigencia_desde: vigenciaDesde,
    precio_neto: parseClp(record.precio_neto || record.precio_sin_i_v_a || record.precio_neto_8),
    precio_lista: parseClp(record.precio_lista),
    precio_con_iva: parseClp(record.precio_con_iva || record.precio_con_i_v_a),
    bono_cidef: parseClp(record.bono_cidef),
    bono_forum: parseClp(record.bono_forum || record.bono_financiamiento || record.bono_financiamiento_global),
    bono_mes: parseClp(record.bono_enero || record.bono_febrero || record.bono_marzo || record.bono_abril || record.bono_mayo || record.bono_junio || record.bono_julio || record.bono_agosto || record.bono_octubre),
    source_file: cleanText(record.source_file),
    source_sheet: cleanText(record.source_sheet),
    source_row: Number(record.source_row) || null,
    raw_payload: record,
  };
}
