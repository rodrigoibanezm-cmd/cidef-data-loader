BEGIN;

-- sucursales_master is the conformed commercial point dimension.
-- It contains CIDEF stores and dealer branches without collapsing dealer legal identity.
ALTER TABLE sucursales_master ALTER COLUMN id_sucursal_vta DROP NOT NULL;
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS sucursal_key text;
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS tipo_canal text;
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS dealer_id bigint REFERENCES dealers_master(dealer_id);
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS dealer_group_id bigint REFERENCES dealer_groups(dealer_group_id);
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS comuna text;
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS estatus text;
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS vigente boolean;
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS bodega_codigo text;
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS bodega_nombre text;
ALTER TABLE sucursales_master ADD COLUMN IF NOT EXISTS fuente text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sucursales_master_key
ON sucursales_master(sucursal_key) WHERE sucursal_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sucursales_master_canal
ON sucursales_master(tipo_canal,vigente);
CREATE INDEX IF NOT EXISTS idx_sucursales_master_dealer_group
ON sucursales_master(dealer_group_id);

-- Legacy ERP identities remain addressable but are not assumed current.
UPDATE sucursales_master
SET sucursal_key='ERP:'||id_sucursal_vta,
    tipo_canal=CASE
      WHEN id_sucursal_vta='39' THEN 'DEALER_AGREGADO'
      WHEN id_sucursal_vta='46' THEN 'NO_COMERCIAL'
      ELSE 'CIDEF'
    END,
    estatus=COALESCE(estatus,'Historico ERP'),
    vigente=COALESCE(vigente,false),
    fuente=COALESCE(fuente,'ventas_raw'),
    updated_at=now()
WHERE sucursal_key IS NULL AND id_sucursal_vta IS NOT NULL;

COMMIT;
