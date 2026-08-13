export const geographyColumn = level => level === 'REGION'
  ? 'r.region_propietario' : 'r.comuna_adquisicion';

export function segmentSql(alias = 'r') {
  return `CASE WHEN ${alias}.descripcion_segmento='CAMIONETA' THEN 'PICK-UP'
    ELSE ${alias}.descripcion_segmento END`;
}

export function geographyPageSql(level) {
  const geography = geographyColumn(level);
  return `WITH places AS (SELECT ${geography} AS geography
    FROM rvm_raw r JOIN brands_master b ON b.marca=r.marca
    WHERE r.fecha >= $1::date AND r.fecha < $2::date
      AND NULLIF(TRIM(${geography}),'') IS NOT NULL
      AND ($3::text='ALL' OR b.origen_marca='CHINA')
      AND ($4::text='TOTAL' OR ${segmentSql()}=$4)
    GROUP BY ${geography})
  SELECT geography,COUNT(*) OVER()::int AS total_geographies FROM places
  ORDER BY geography LIMIT $5 OFFSET $6`;
}

export function analysisBaseSql(level) {
  const geography = geographyColumn(level);
  return `base AS (SELECT CASE WHEN r.fecha >= $1::date AND r.fecha < $2::date
      THEN 'current' ELSE 'comparison' END AS period_key,
    to_char(date_trunc('month',r.fecha),'YYYY-MM') AS year_month,
    ${geography} AS geography,b.marca,SUM(r.cantidad::numeric) AS units
    FROM rvm_raw r JOIN brands_master b ON b.marca=r.marca
    WHERE ((r.fecha >= $1::date AND r.fecha < $2::date)
      OR ($3::date IS NOT NULL AND r.fecha >= $3::date AND r.fecha < $4::date))
      AND ${geography}=ANY($5::text[])
      AND ($6::text='ALL' OR b.origen_marca='CHINA')
      AND ($7::text='TOTAL' OR ${segmentSql()}=$7)
    GROUP BY 1,2,3,4)`;
}

export function analysisParams(periods, geographies, input) {
  const exclusive = value => value && `${shift(value)}-01`;
  const shift = value => {
    const [year, month] = value.split('-').map(Number);
    return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  };
  return [`${periods.current.desde}-01`, exclusive(periods.current.hasta),
    periods.previous && `${periods.previous.desde}-01`,
    periods.previous && exclusive(periods.previous.hasta),
    geographies, input.universe, input.segment, input.brand];
}
