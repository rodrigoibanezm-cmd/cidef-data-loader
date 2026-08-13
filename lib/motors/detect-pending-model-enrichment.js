import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

export async function run() {
  const sql = db();
  const rows = await sql.query(`
    SELECT
      avm.year_month,
      vm.model_key,
      b.marca,
      vm.modelo_homologado,
      vm.segmento,
      avm.unidades_mes,
      vm.largo_mm,
      vm.cilindrada_cc,
      vm.rango_motor
    FROM active_vehicle_models avm
    JOIN vehicle_models_master vm ON vm.model_key = avm.model_key
    JOIN brands_master b ON b.brand_id = vm.brand_id
    WHERE vm.largo_mm IS NULL
       OR (vm.cilindrada_cc IS NULL AND COALESCE(vm.rango_motor, '') <> 'NA_BEV')
       OR vm.rango_motor IS NULL
       OR vm.rango_motor = 'PENDIENTE'
    ORDER BY avm.unidades_mes DESC, b.marca, vm.modelo_homologado
  `);

  return {
    pending_models: rows.length,
    rows,
  };
}
