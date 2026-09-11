import { queryDb } from '../neon.js';

const SOURCE = 'forum_raw';
const TABLE = 'forum_operacion_canonica_v01';

const STORE_MAP = new Map([
  ['CIDEF MALL PLAZA SUR', 9],
  ['CIDEF MALL PLAZA NORTE', 8],
  ['CIDEF MALL PLAZA VESPUCIO', 7],
  ['CIDEF MALL PLAZA ALAMEDA', 19],
  ['CIDEF MALL PLAZA EGAÑA', 11],
  ['CIDEF PAJARITOS', 4],
  ['CIDEF MALL PLAZA OESTE', 10],
  ['CIDEF MALL PLAZA EL TREBOL', 18],
  ['CIDEF VICUÑA MACKENNA', 20],
  ['CIDEF MALL COSTANERA', 22],
  ['CIDEF MALL ESPACIO URBANO', 5],
  ['CIDEF BELLAVISTA', 3],
  ['CIDEF MALL PASEO QUILIN', 21],
  ['CIDEF CENCO FLORIDA', 44],
  ['CIDEF MALL PLAZA QUILIN', 21],
]);

export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function nameSignature(value) {
  const normalized = normalizeName(value);
  if (!normalized) return '';
  return normalized.split(' ').sort().join(' ');
}

function sqlNormalize(column) {
  return `btrim(regexp_replace(upper(translate(coalesce(${column},''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNAEIOUUN')), '[^A-Z0-9]+', ' ', 'g'))`;
}

async function ensureSchema() {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS public.${TABLE} (
      numero_operacion bigint PRIMARY KEY REFERENCES public.forum_raw(numero_operacion),
      rut_normalizado text,
      fecha_cotizacion timestamp without time zone,
      sucursal_id bigint REFERENCES public.sucursales_master(sucursal_id),
      persona_id bigint REFERENCES public.personas_master(persona_id),
      marca_id bigint REFERENCES public.marcas_master_v01(marca_id),
      modelo_id bigint REFERENCES public.modelos_master_v01(modelo_id),
      estado_final_revision text,
      estado_final text,
      store_resolution_status text NOT NULL,
      seller_resolution_status text NOT NULL,
      seller_store_status text NOT NULL DEFAULT 'UNRESOLVED',
      product_resolution_status text NOT NULL,
      source_file text,
      source_loaded_at timestamp with time zone,
      canonicalized_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await queryDb(`ALTER TABLE public.${TABLE} ADD COLUMN IF NOT EXISTS seller_store_status text NOT NULL DEFAULT 'UNRESOLVED'`);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_forum_canonica_store_date ON public.${TABLE}(sucursal_id, fecha_cotizacion)`);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_forum_canonica_seller_date ON public.${TABLE}(persona_id, fecha_cotizacion)`);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_forum_canonica_model_date ON public.${TABLE}(modelo_id, fecha_cotizacion)`);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_forum_canonica_rut ON public.${TABLE}(rut_normalizado)`);
}

async function seedStoreAliases() {
  const raw = await queryDb(`SELECT DISTINCT sucursal FROM public.forum_raw WHERE sucursal IS NOT NULL AND btrim(sucursal)<>'' ORDER BY sucursal`);
  const ownStores = await queryDb(`SELECT sucursal_id FROM public.sucursales_master WHERE tipo_canal='CIDEF'`);
  const ownIds = new Set(ownStores.map((row) => Number(row.sucursal_id)));
  const existing = await queryDb(`SELECT valor_normalizado FROM public.sucursal_aliases WHERE fuente=$1`, [SOURCE]);
  const existingSet = new Set(existing.map((row) => row.valor_normalizado));
  const maxRows = await queryDb(`SELECT COALESCE(MAX(sucursal_alias_id),0)::bigint AS max_id FROM public.sucursal_aliases`);
  let nextId = Number(maxRows[0]?.max_id ?? 0) + 1;
  let inserted = 0;
  const unresolved = [];

  for (const row of raw) {
    const rawName = String(row.sucursal);
    const normalized = normalizeName(rawName);
    if (existingSet.has(normalized)) continue;
    const sucursalId = STORE_MAP.get(normalized);
    if (!sucursalId || !ownIds.has(Number(sucursalId))) {
      unresolved.push(rawName);
      continue;
    }
    await queryDb(
      `INSERT INTO public.sucursal_aliases
       (sucursal_alias_id,sucursal_id,fuente,valor_raw,valor_normalizado,match_method,validated)
       VALUES ($1,$2,$3,$4,$5,'forum_certified_own_store',true)
       ON CONFLICT (fuente,valor_normalizado) DO NOTHING`,
      [nextId++, sucursalId, SOURCE, rawName, normalized],
    );
    inserted++;
    existingSet.add(normalized);
  }
  return { inserted, unresolved };
}

async function seedSellerAliases() {
  const forumRows = await queryDb(`
    SELECT DISTINCT fr.vendedor, sa.sucursal_id
    FROM public.forum_raw fr
    JOIN public.sucursal_aliases sa
      ON sa.fuente=$1 AND sa.valor_normalizado=${sqlNormalize('fr.sucursal')}
    JOIN public.sucursales_master sm ON sm.sucursal_id=sa.sucursal_id AND sm.tipo_canal='CIDEF'
    WHERE fr.vendedor IS NOT NULL AND btrim(fr.vendedor)<>''
    ORDER BY sa.sucursal_id, fr.vendedor
  `, [SOURCE]);

  const candidates = await queryDb(`
    SELECT p.persona_id, ps.sucursal_id, p.nombre_canonico AS nombre
    FROM public.personas_master p
    JOIN public.persona_sucursal ps ON ps.persona_id=p.persona_id AND ps.rol='VENDEDOR_TIENDA'
    JOIN public.sucursales_master sm ON sm.sucursal_id=ps.sucursal_id AND sm.tipo_canal='CIDEF'
    WHERE p.nombre_canonico IS NOT NULL
    UNION ALL
    SELECT pa.persona_id, ps.sucursal_id, pa.valor_raw AS nombre
    FROM public.persona_aliases pa
    JOIN public.persona_sucursal ps ON ps.persona_id=pa.persona_id AND ps.rol='VENDEDOR_TIENDA'
    JOIN public.sucursales_master sm ON sm.sucursal_id=ps.sucursal_id AND sm.tipo_canal='CIDEF'
    WHERE pa.tipo_alias='nombre' AND pa.persona_id IS NOT NULL
  `);

  const candidateMap = new Map();
  for (const row of candidates) {
    const signature = nameSignature(row.nombre);
    if (!signature) continue;
    const key = `${row.sucursal_id}|${signature}`;
    if (!candidateMap.has(key)) candidateMap.set(key, new Set());
    candidateMap.get(key).add(Number(row.persona_id));
  }

  const existingRows = await queryDb(`SELECT valor_normalizado, persona_id FROM public.persona_aliases WHERE fuente=$1 AND tipo_alias='nombre'`, [SOURCE]);
  const existing = new Map(existingRows.map((row) => [row.valor_normalizado, row.persona_id == null ? null : Number(row.persona_id)]));
  const maxRows = await queryDb(`SELECT COALESCE(MAX(persona_alias_id),0)::bigint AS max_id FROM public.persona_aliases`);
  let nextId = Number(maxRows[0]?.max_id ?? 0) + 1;
  let inserted = 0;
  const unresolved = [];
  const ambiguous = [];

  for (const row of forumRows) {
    const rawName = String(row.vendedor);
    const normalized = normalizeName(rawName);
    if (existing.has(normalized)) continue;
    const key = `${row.sucursal_id}|${nameSignature(rawName)}`;
    const ids = [...(candidateMap.get(key) ?? [])];
    if (ids.length === 1) {
      await queryDb(
        `INSERT INTO public.persona_aliases
         (persona_alias_id,persona_id,fuente,valor_raw,valor_normalizado,tipo_alias,match_method,confidence,validated)
         VALUES ($1,$2,$3,$4,$5,'nombre','exact_token_signature_same_store',1,true)
         ON CONFLICT (fuente,tipo_alias,valor_normalizado) DO NOTHING`,
        [nextId++, ids[0], SOURCE, rawName, normalized],
      );
      inserted++;
      existing.set(normalized, ids[0]);
    } else if (ids.length > 1) {
      ambiguous.push({ vendedor: rawName, sucursal_id: Number(row.sucursal_id), candidates: ids });
    } else {
      unresolved.push({ vendedor: rawName, sucursal_id: Number(row.sucursal_id) });
    }
  }

  return { inserted, unresolved, ambiguous };
}

async function refreshCanonical() {
  await queryDb(`
    INSERT INTO public.${TABLE} (
      numero_operacion,rut_normalizado,fecha_cotizacion,sucursal_id,persona_id,marca_id,modelo_id,
      estado_final_revision,estado_final,store_resolution_status,seller_resolution_status,seller_store_status,product_resolution_status,
      source_file,source_loaded_at,canonicalized_at
    )
    SELECT
      fr.numero_operacion,
      NULLIF(upper(regexp_replace(coalesce(fr.rut,''),'[^0-9Kk]','','g')),''),
      fr.fecha_cotizacion,
      sa.sucursal_id,
      pa.persona_id,
      mm.marca_id,
      mo.modelo_id,
      fr.estado_final_revision,
      fr.estado_final,
      CASE WHEN sa.sucursal_id IS NULL THEN 'UNRESOLVED' ELSE 'RESOLVED_ALIAS' END,
      CASE WHEN pa.persona_id IS NULL THEN 'UNRESOLVED' ELSE 'RESOLVED_ALIAS' END,
      CASE
        WHEN pa.persona_id IS NULL OR sa.sucursal_id IS NULL THEN 'UNRESOLVED'
        WHEN EXISTS (
          SELECT 1 FROM public.persona_sucursal ps
          WHERE ps.persona_id=pa.persona_id
            AND ps.sucursal_id=sa.sucursal_id
            AND ps.rol='VENDEDOR_TIENDA'
            AND (ps.valid_from IS NULL OR ps.valid_from<=fr.fecha_cotizacion::date)
            AND (ps.valid_to IS NULL OR ps.valid_to>=fr.fecha_cotizacion::date)
        ) THEN 'ALIGNED'
        ELSE 'MISMATCH_MASTER_ASSIGNMENT'
      END,
      CASE WHEN mo.modelo_id IS NULL THEN 'UNRESOLVED' ELSE 'RESOLVED_EXACT_MASTER' END,
      fr.source_file,
      fr.loaded_at,
      now()
    FROM public.forum_raw fr
    LEFT JOIN public.sucursal_aliases sa
      ON sa.fuente='forum_raw' AND sa.valor_normalizado=${sqlNormalize('fr.sucursal')}
    LEFT JOIN public.persona_aliases pa
      ON pa.fuente='forum_raw' AND pa.tipo_alias='nombre' AND pa.valor_normalizado=${sqlNormalize('fr.vendedor')}
    LEFT JOIN public.marcas_master_v01 mm
      ON upper(mm.nombre_canonico)=upper(fr.marca_vehiculo)
    LEFT JOIN public.modelos_master_v01 mo
      ON mo.marca_id=mm.marca_id AND upper(mo.nombre_canonico)=upper(fr.modelo_vehiculo)
    ON CONFLICT (numero_operacion) DO UPDATE SET
      rut_normalizado=EXCLUDED.rut_normalizado,
      fecha_cotizacion=EXCLUDED.fecha_cotizacion,
      sucursal_id=EXCLUDED.sucursal_id,
      persona_id=EXCLUDED.persona_id,
      marca_id=EXCLUDED.marca_id,
      modelo_id=EXCLUDED.modelo_id,
      estado_final_revision=EXCLUDED.estado_final_revision,
      estado_final=EXCLUDED.estado_final,
      store_resolution_status=EXCLUDED.store_resolution_status,
      seller_resolution_status=EXCLUDED.seller_resolution_status,
      seller_store_status=EXCLUDED.seller_store_status,
      product_resolution_status=EXCLUDED.product_resolution_status,
      source_file=EXCLUDED.source_file,
      source_loaded_at=EXCLUDED.source_loaded_at,
      canonicalized_at=now()
  `);

  const invariant = await queryDb(`
    SELECT COUNT(*)::int AS bad
    FROM public.${TABLE} f
    JOIN public.sucursales_master s ON s.sucursal_id=f.sucursal_id
    WHERE s.tipo_canal<>'CIDEF'
  `);
  if (Number(invariant[0]?.bad ?? 0) !== 0) throw new Error('Forum own-store invariant violated: non-CIDEF store resolved');

  const stats = await queryDb(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE sucursal_id IS NOT NULL)::int AS store_resolved,
      COUNT(*) FILTER (WHERE persona_id IS NOT NULL)::int AS seller_resolved,
      COUNT(*) FILTER (WHERE seller_store_status='ALIGNED')::int AS seller_store_aligned,
      COUNT(*) FILTER (WHERE seller_store_status='MISMATCH_MASTER_ASSIGNMENT')::int AS seller_store_mismatch,
      COUNT(*) FILTER (WHERE marca_id IS NOT NULL)::int AS brand_resolved,
      COUNT(*) FILTER (WHERE modelo_id IS NOT NULL)::int AS model_resolved,
      COUNT(*) FILTER (WHERE sucursal_id IS NOT NULL AND persona_id IS NOT NULL AND modelo_id IS NOT NULL)::int AS fully_resolved
    FROM public.${TABLE}
  `);
  return stats[0];
}

export async function run() {
  const startedAt = Date.now();
  await ensureSchema();
  const stores = await seedStoreAliases();
  const sellers = await seedSellerAliases();
  const stats = await refreshCanonical();
  return {
    status: 'refreshed',
    table: TABLE,
    source: SOURCE,
    invariant: 'FORUM_RESOLVES_ONLY_TO_CIDEF_STORES',
    store_aliases_inserted: stores.inserted,
    unresolved_store_aliases: stores.unresolved,
    seller_aliases_inserted: sellers.inserted,
    unresolved_seller_aliases: sellers.unresolved,
    ambiguous_seller_aliases: sellers.ambiguous,
    coverage: {
      total: Number(stats.total),
      store_resolved: Number(stats.store_resolved),
      seller_resolved: Number(stats.seller_resolved),
      seller_store_aligned: Number(stats.seller_store_aligned),
      seller_store_mismatch: Number(stats.seller_store_mismatch),
      brand_resolved: Number(stats.brand_resolved),
      model_resolved: Number(stats.model_resolved),
      fully_resolved: Number(stats.fully_resolved),
    },
    elapsed_ms: Date.now() - startedAt,
  };
}
