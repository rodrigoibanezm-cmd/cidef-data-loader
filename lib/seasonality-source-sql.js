const CIDEF_BRANDS = `ARRAY['FOTON','DFM','DONGFENG']::text[]`;
const NOTE_DATE_PATTERN = `^(0?[1-9]|1[0-2])/(0?[1-9]|[12][0-9]|3[01])/[0-9]{2} ([01]?[0-9]|2[0-3]):[0-5][0-9]$`;

export function safeNoteTimestampSql(column) {
  const value = `TRIM(${column})`;
  const month = `split_part(${value},'/',1)::int`;
  const day = `split_part(${value},'/',2)::int`;
  const year = `split_part(split_part(${value},'/',3),' ',1)::int`;
  return `CASE WHEN ${value} ~ '${NOTE_DATE_PATTERN}' THEN CASE WHEN ${day} <= CASE
    WHEN ${month}=2 THEN 28+CASE WHEN MOD(${year},4)=0 THEN 1 ELSE 0 END
    WHEN ${month}=ANY(ARRAY[4,6,9,11]) THEN 30 ELSE 31 END
    THEN to_timestamp(${value},'MM/DD/YY HH24:MI') ELSE NULL END ELSE NULL END`;
}

function valueSql(groupBy, alias) {
  const columns = {
    TOTAL: `'TOTAL'`, MARCA: `${alias}.marca`, MODELO: `${alias}.modelo`,
    SUCURSAL: `${alias}.branch`, VENDEDOR: `${alias}.seller`,
  };
  return `COALESCE(NULLIF(UPPER(TRIM(${columns[groupBy]})),''),'SIN_DATO')`;
}

function filteredRvm(scope) {
  const cidef = scope === 'CIDEF'
    ? `AND UPPER(TRIM(r.marca))=ANY(${CIDEF_BRANDS})` : '';
  return `filtered AS (SELECT r.fecha AS event_date,
    UPPER(TRIM(r.marca)) AS marca,UPPER(TRIM(r.modelo_homologado)) AS modelo,
    COALESCE(r.cantidad::numeric,0) AS units,
    UPPER(COALESCE(NULLIF(TRIM(r.vin),''),NULLIF(TRIM(r.n_chasis),''))) AS join_key
    FROM rvm_raw r WHERE r.fecha IS NOT NULL ${cidef}
      AND ($1::date IS NULL OR r.fecha >= $1::date)
      AND ($2::date IS NULL OR r.fecha < $2::date)
      AND ($3::text IS NULL OR UPPER(TRIM(r.marca))=$3)
      AND ($4::text IS NULL OR UPPER(TRIM(r.modelo_homologado))=$4))`;
}

function cidefNotes() {
  const invoiceTimestamp = safeNoteTimestampSql('n.fecha_factura');
  const noteTimestamp = safeNoteTimestampSql('n.fecha_nota_de_venta');
  return `note_candidates AS (SELECT UPPER(TRIM(n.chasis)) AS join_key,
    UPPER(TRIM(n.vendedor)) AS seller,UPPER(TRIM(n.desc_sucursal_vta)) AS branch,
    ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(n.chasis)) ORDER BY
      (NULLIF(TRIM(n.fecha_factura::text),'') IS NOT NULL) DESC,
      ${invoiceTimestamp} DESC NULLS LAST,
      ${noteTimestamp} DESC NULLS LAST,
      ((NULLIF(TRIM(n.vendedor),'') IS NOT NULL)::int+
       (NULLIF(TRIM(n.desc_sucursal_vta),'') IS NOT NULL)::int) DESC,
      UPPER(TRIM(n.vendedor)) ASC NULLS LAST,
      UPPER(TRIM(n.desc_sucursal_vta)) ASC NULLS LAST) AS choice
    FROM notas_venta_raw n JOIN (SELECT DISTINCT join_key FROM filtered
      WHERE join_key IS NOT NULL) k ON k.join_key=UPPER(TRIM(n.chasis))
    WHERE NULLIF(TRIM(n.chasis),'') IS NOT NULL),
  notes_one AS (SELECT join_key,seller,branch FROM note_candidates WHERE choice=1),
  enriched AS (SELECT f.*,n.seller,n.branch,n.join_key AS matched_key
    FROM filtered f LEFT JOIN notes_one n ON n.join_key=f.join_key)`;
}

export function seasonalitySourceSql(input) {
  if (input.scope === 'MARKET') return `${filteredRvm('MARKET')},
  analysis AS (SELECT event_date,${valueSql(input.group_by, 'f')} AS group_value,units
    FROM filtered f)`;
  return `${filteredRvm('CIDEF')},${cidefNotes()},
  analysis AS (SELECT event_date,${valueSql(input.group_by, 'e')} AS group_value,units
    FROM enriched e WHERE matched_key IS NOT NULL
      AND ($5::text IS NULL OR branch=$5) AND ($6::text IS NULL OR seller=$6))`;
}

export function seasonalityStatsSql(input) {
  return `/* seasonality_stats */ WITH ${seasonalitySourceSql(input)}
    SELECT to_char(date_trunc('month',MIN(event_date)),'YYYY-MM') AS date_from,
      to_char(date_trunc('month',MAX(event_date)),'YYYY-MM') AS date_to,
      COUNT(DISTINCT group_value)::int AS total_groups FROM analysis`;
}

export function cidefCoverageSql(input) {
  return `/* cidef_coverage */ WITH ${filteredRvm('CIDEF')},${cidefNotes()}
    SELECT COUNT(*)::int AS rvm_cidef,
      COUNT(*) FILTER (WHERE matched_key IS NOT NULL)::int AS matched,
      COUNT(*) FILTER (WHERE matched_key IS NULL)::int AS unmatched,
      ROUND(100.0*COUNT(*) FILTER (WHERE matched_key IS NOT NULL)/
        NULLIF(COUNT(*),0),2) AS match_pct FROM enriched`;
}
