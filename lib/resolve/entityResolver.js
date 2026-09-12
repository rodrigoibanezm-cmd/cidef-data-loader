function normalizeKey(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function result(type, input, rows) {
  if (rows.length === 1) return { status:'UNIQUE', resolved:true, type, display_name:rows[0].display_name, canonical_id:String(rows[0].canonical_id) };
  if (rows.length > 1) return { status:'AMBIGUOUS', resolved:false, type, input, candidates:rows.map(r=>({display_name:r.display_name})) };
  return { status:'NOT_FOUND', resolved:false, type, input };
}

export async function resolveCanonicalEntity(entity, options = {}) {
  if (!entity) return { status:'MISSING', resolved:false };
  const type = String(entity.type).toUpperCase();
  const value = String(entity.value ?? '').trim();
  if (type === 'COMPANY') return { status:'UNIQUE', resolved:true, type:'COMPANY', display_name:'CIDEF', canonical_id:'COMPANY' };
  let sql = options.sql;
  if (!sql) {
    const { customGptDb } = await import('../custom-gpt/db.js');
    sql = customGptDb();
  }
  const key = normalizeKey(value);
  let rows = [];
  if (type === 'BRAND') {
    rows = await sql.query(`SELECT DISTINCT m.marca_id AS canonical_id, m.nombre_canonico AS display_name FROM public.marcas_master_v01 m LEFT JOIN public.producto_aliases_v01 a ON a.marca_id=m.marca_id AND a.nivel='MARCA' AND a.estado='RESUELTO' WHERE upper(m.nombre_canonico)=upper($1) OR upper(m.nombre_normalizado)=upper($2) OR upper(a.valor_raw)=upper($1) OR upper(a.valor_normalizado)=upper($2) ORDER BY m.marca_id LIMIT 10`, [value, key]);
  } else if (type === 'MODEL') {
    rows = await sql.query(`SELECT DISTINCT m.modelo_id AS canonical_id, m.nombre_canonico AS display_name FROM public.modelos_master_v01 m LEFT JOIN public.producto_aliases_v01 a ON a.modelo_id=m.modelo_id AND a.nivel='MODELO' AND a.estado='RESUELTO' WHERE upper(m.nombre_canonico)=upper($1) OR upper(m.nombre_normalizado)=upper($2) OR upper(a.valor_raw)=upper($1) OR upper(a.valor_normalizado)=upper($2) ORDER BY m.modelo_id LIMIT 10`, [value, key]);
  } else if (type === 'STORE') {
    rows = await sql.query(`SELECT DISTINCT s.sucursal_id AS canonical_id, s.nombre_canonico AS display_name FROM public.sucursales_master s LEFT JOIN public.sucursal_aliases a ON a.sucursal_id=s.sucursal_id AND a.validated=true WHERE coalesce(s.vigente,true)=true AND (upper(s.nombre_canonico)=upper($1) OR upper(a.valor_raw)=upper($1) OR upper(a.valor_normalizado)=upper($2)) ORDER BY s.sucursal_id LIMIT 10`, [value, key]);
  } else if (type === 'SELLER') {
    rows = await sql.query(`SELECT DISTINCT p.persona_id AS canonical_id, p.nombre_canonico AS display_name FROM public.personas_master p JOIN public.persona_roles r ON r.persona_id=p.persona_id LEFT JOIN public.persona_aliases a ON a.persona_id=p.persona_id AND a.validated=true WHERE r.rol='VENDEDOR_TIENDA' AND r.vigente=true AND (upper(p.nombre_canonico)=upper($1) OR upper(p.usuario_canonico)=upper($1) OR upper(a.valor_raw)=upper($1) OR upper(a.valor_normalizado)=upper($2)) ORDER BY p.persona_id LIMIT 10`, [value, key]);
  } else {
    return { status:'UNSUPPORTED', resolved:false, type, input:value };
  }
  return result(type, value, rows);
}
