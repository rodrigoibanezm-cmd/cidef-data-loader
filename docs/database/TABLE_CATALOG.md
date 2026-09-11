# CIDEF — Table Catalog

Estado: **CURRENT**  
Fuente física: Neon `cidef_data / main`  
Snapshot: **2026-09-11**

Este catálogo clasifica las tablas existentes. `filas` corresponde a la estimación de `pg_stat_user_tables` al momento del snapshot y **no es un contrato**.

## RAW

| Tabla | Estado | Grain / clave observable | Filas aprox. | Rol físico |
|---|---|---|---:|---|
| `CRM_Cidef_raw` | CURRENT | registro CRM fuente; sin PK física | 57.160 | Evidencia CRM original cargada. |
| `forum_raw` | CURRENT | `numero_operacion` (PK) | 4.230 | Cotizaciones/operaciones recibidas desde Forum. |
| `notas_venta_raw` | CURRENT | filas de nota/operación; sin PK física | 63.549 | Evidencia de notas de venta y operación. |
| `rvm_raw` | CURRENT | registro RVM; sin PK física | 1.982.614 | Evidencia de mercado RVM, incluyendo `data_status` y `snapshot_date`. |
| `vehiculos_raw` | CURRENT | registro vehículo fuente; sin PK física | 36.881 | Evidencia de stock/vehículo/VIN. |
| `ventas_raw` | CURRENT | registro venta fuente; sin PK física | 46.565 | Evidencia de ventas/facturación. |

## MASTER — producto

| Tabla | Estado | Grain / PK | Filas aprox. | Relaciones / rol |
|---|---|---|---:|---|
| `marcas_master_v01` | CURRENT | 1 marca canónica / `marca_id` | 102 | Raíz de identidad de producto; contiene `origin_group`. |
| `modelos_master_v01` | CURRENT | 1 modelo dentro de marca / `modelo_id` | 779 | FK `marca_id → marcas_master_v01`. |
| `versiones_master_v01` | CURRENT | 1 versión dentro de modelo / `version_id` | 11.553 | FK `modelo_id → modelos_master_v01`. |
| `producto_aliases_v01` | CURRENT | 1 alias observado / `alias_id` | 1.157 | Resuelve evidencia RAW hacia marca/modelo/versión V0.1. |
| `producto_clasificacion_v01` | CURRENT | 1 clasificación / `clasificacion_id` | 3.235 | Taxonomías temporales asociadas a identidad producto. |
| `producto_portafolio_v01` | CURRENT | 1 pertenencia temporal de versión / `portafolio_id` | 61 | Portafolio temporal certificado por organización. |
| `marcas_master` | LEGACY | `marca_id` | 6 | MASTER de producto anterior a V0.1 final. |
| `modelos_master` | LEGACY | `modelo_id` | 193 | MASTER de producto anterior a V0.1 final. |
| `versiones_master` | LEGACY | `version_id` | 241 | MASTER de producto anterior a V0.1 final. |
| `producto_aliases` | LEGACY | `producto_alias_id` | 648 | Aliases del MASTER anterior. |

La clasificación `LEGACY` anterior está definida explícitamente por `docs/master/MASTER_LAYER_V0.1.md`.

## MASTER — sucursal / dealer

| Tabla | Estado | Grain / PK | Filas aprox. | Relaciones / rol |
|---|---|---|---:|---|
| `sucursales_master` | CURRENT | 1 punto físico/comercial / `sucursal_id` | 64 | Puede enlazar `dealer_id` y/o `dealer_group_id`. |
| `sucursal_aliases` | CURRENT | 1 alias de sucursal / `sucursal_alias_id` | 126 | FK a `sucursales_master`. |
| `dealer_groups` | CURRENT | 1 identidad comercial / `dealer_group_id` | 22 | Agrupador comercial. |
| `dealers_master` | CURRENT | 1 identidad jurídica / `dealer_id` | 24 | FK opcional a `dealer_groups`. |
| `dealer_aliases` | CURRENT | 1 alias dealer / `dealer_alias_id` | 24 | FK a `dealers_master`. |
| `dealer_supervisor` | CURRENT | 1 asignación temporal supervisor / `dealer_supervisor_id` | 19 | FK a dealer/group y `personas_master`. |

## MASTER — persona / organización

| Tabla | Estado | Grain / PK | Filas aprox. | Relaciones / rol |
|---|---|---|---:|---|
| `personas_master` | CURRENT | 1 identidad persona / `persona_id` | 237 | Identidad persistente. |
| `persona_aliases` | CURRENT | 1 alias persona / `persona_alias_id` | 356 | FK a `personas_master`. |
| `persona_roles` | CURRENT | 1 rol temporal / `persona_role_id` | 79 | FK a `personas_master`. |
| `persona_sucursal` | CURRENT | 1 asignación temporal persona↔sucursal / `persona_sucursal_id` | 84 | FK a persona y sucursal. |
| `persona_estado_comercial` | CURRENT | 1 estado actual por persona / `persona_id` | 237 | Pertenencia a fuerza comercial a fecha de corte. |
| `organizations_master` | CURRENT | 1 organización / `organization_id` | 3 | Identidad organizacional. |
| `product_organization_membership` | CURRENT | 1 pertenencia producto↔organización / `membership_id` | 16 | FK a `organizations_master`; `product_id` depende de `product_level`. |
| `rvm_organization_historical_rule` | CURRENT | 1 regla temporal / `rule_id` | 2 | Reglas certificadas de pertenencia histórica RVM. |
| `master_conflicts` | CURRENT | 1 conflicto / `conflict_id` | 33 | Registro explícito de conflictos de reconciliación. |

## CANONICAL / BRIDGE

| Tabla | Estado | Grain / PK | Filas aprox. | Relaciones / rol |
|---|---|---|---:|---|
| `vehiculo_canonico` | CURRENT | 1 vehículo / `vehiculo_id`; VIN obligatorio | 36.873 | Une VIN con producto, canal de salida, sucursal/dealer y estado comercial. |
| `forum_operacion_canonica_v01` | CURRENT | 1 operación Forum / `numero_operacion` | 4.230 | FK a `forum_raw`, producto V0.1, persona y sucursal. |
| `forum_crm_vin_bridge_v01` | CURRENT | 1 operación Forum / `numero_operacion` | 4.230 | Materializa resolución Forum↔CRM↔VIN. |
| `crm_cidef_venta_link_v01` | CURRENT | vínculo deal CRM↔VIN/ERP; sin PK física | 1.332 | Evidencia materializada de cierre CRM contra venta. |
| `commercial_operation_master_v01` | CURRENT | 1 identidad de operación / `commercial_operation_id` | 60.524 | Integra presencia y resolución de Forum, CRM y VIN/venta. |
| `price_episode_canonico_v01` | CURRENT | 1 episodio temporal de condición comercial / `price_episode_id` | 747 | FK a versión MASTER V0.1 y `price_versions`. |
| `price_episode_vin_v01` | CURRENT | episodio×vehículo / PK compuesta | 7.221 | FK a episodio, vehículo y versión MASTER. |

## PRICING — fuente / historia

| Tabla | Estado | Grain / PK | Filas aprox. | Rol |
|---|---|---|---:|---|
| `price_versions` | CURRENT | 1 versión de lista de precios / `price_version_id` | 81 | Identidad física de versión publicada en pricing. |
| `price_history` | CURRENT | 1 observación histórica / `price_history_id` | 3.700 | Condición comercial publicada por vigencia y fuente. |
| `price_import_staging` | STAGING | 1 fila importada / `id` | 0 | Área temporal de importación; no autoridad. |

## PROYECCIONES

| Tabla | Estado | Grain / PK | Filas aprox. | Relaciones / rol |
|---|---|---|---:|---|
| `weekly_sales_projection` | CURRENT | 1 fila de proyección normalizada / `projection_id` | 92 | FK a sucursal, persona y modelo MASTER. |
| `weekly_sales_projection_staging` | STAGING | 1 fila fuente / `staging_id` | 92 | Conserva campos raw y `dedupe_key` antes de normalización. |

## ANALYTICAL / DERIVED

| Tabla | Estado | Grain observable | Filas aprox. | Rol |
|---|---|---|---:|---|
| `market_penetration_monthly_all` | REFERENCE | mes×marca×segmento | 0 | Materialización analítica de penetración mensual total. |
| `market_penetration_monthly_china` | REFERENCE | mes×marca×segmento | 0 | Materialización analítica de penetración mensual china. |

Ambas están vacías en este snapshot. No deben considerarse autoridad de runtime por su sola existencia.

## OPERATIONAL — tienda

| Tabla | Estado | Grain / PK | Filas aprox. | Relaciones / rol |
|---|---|---|---:|---|
| `store_challenges` | OPERATIONAL | 1 desafío / `challenge_id` | 0 | FK a sucursal; preserva evidencia analítica de origen. |
| `store_actions` | OPERATIONAL | 1 acción / `action_id` | 0 | FK a desafío, sucursal y persona responsable. |
| `store_action_events` | OPERATIONAL | 1 evento de acción / `event_id` | 0 | FK a `store_actions`. |

## OPERATIONAL — bonos/documentos

| Tabla | Estado | Grain / PK | Filas aprox. | Rol físico |
|---|---|---|---:|---|
| `bonus_requests` | OPERATIONAL | 1 solicitud / `id` | 6 | Estado principal del workflow de bonos. |
| `bonus_request_documents` | OPERATIONAL | 1 documento / `id` | 24 | FK a solicitud. |
| `bonus_request_reviews` | OPERATIONAL | 1 revisión / `id` | 0 | FK a solicitud y documento. |
| `bonus_request_events` | OPERATIONAL | 1 evento / `id` | 5 | Auditoría de acciones del workflow. |
| `bonus_document_pages` | OPERATIONAL | 1 página / `id` | 0 | FK a solicitud y documento. |
| `bonus_auditors` | OPERATIONAL | 1 auditor / `id` | 3 | Configuración de auditores. |
| `bonus_fv_extractions` | OPERATIONAL | 1 extracción FV / `id` | 7 | Resultado de extracción documental. |
| `bonus_fc_extractions` | OPERATIONAL | 1 extracción FC / `id` | 8 | Resultado de extracción documental. |
| `bonus_financiamiento_extractions` | OPERATIONAL | 1 extracción financiamiento / `id` | 3 | Resultado de extracción documental. |
| `bonus_inscripcion_extractions` | OPERATIONAL | 1 extracción inscripción / `id` | 6 | Resultado de extracción documental. |
| `bonus_reposicion_extractions` | OPERATIONAL | 1 extracción reposición / `id` | 6 | Resultado de extracción documental. |
| `bonus_document_extraction_audits` | OPERATIONAL | 1 auditoría de extracción / `id` | 0 | Evidencia y resolución de problemas de extracción. |
| `bonus_operation_closure_audits` | OPERATIONAL | 1 auditoría de cierre / `id` | 84 | Evidencia de cierre documental por VIN/fase. |
| `bonus_operation_identity_audits` | OPERATIONAL | 1 auditoría de identidad / `id` | 13 | Evidencia de resolución de identidad. |
| `bonus_price_lookup_audits` | OPERATIONAL | 1 auditoría de pricing / `id` | 17 | Evidencia de lookup de precio. |

## TEMP / TEST

| Tabla | Estado | Filas aprox. | Motivo de exclusión |
|---|---|---:|---|
| `crm_cidef_tmp` | TEMP | 22.396 | Tabla intermedia; nombre y estructura indican materialización temporal. No usar como autoridad. |
| `crm_cidef_vin_tests` | TEST | 2.165 | Tabla de pruebas de matching VIN. No usar como autoridad. |

## Claves físicas relevantes

PK/FK principales observadas en Neon:

```text
marcas_master_v01.marca_id
  → modelos_master_v01.marca_id

modelos_master_v01.modelo_id
  → versiones_master_v01.modelo_id

versiones_master_v01.version_id
  → vehiculo_canonico.version_id
  → price_episode_canonico_v01.version_id
  → price_episode_vin_v01.version_id

sucursales_master.sucursal_id
  → persona_sucursal.sucursal_id
  → forum_operacion_canonica_v01.sucursal_id
  → weekly_sales_projection.sucursal_id
  → vehiculo_canonico.sucursal_venta_id

personas_master.persona_id
  → persona_roles.persona_id
  → persona_sucursal.persona_id
  → persona_estado_comercial.persona_id
  → dealer_supervisor.persona_id
  → forum_operacion_canonica_v01.persona_id
  → weekly_sales_projection.persona_id

forum_raw.numero_operacion
  → forum_operacion_canonica_v01.numero_operacion
  → forum_crm_vin_bridge_v01.numero_operacion

price_episode_canonico_v01.price_episode_id
  → price_episode_vin_v01.price_episode_id

vehiculo_canonico.vehiculo_id
  → price_episode_vin_v01.vehiculo_id
```

Para semántica y restricciones que no estén expresadas físicamente como FK, consultar `RELATIONSHIPS.md` y la documentación de MASTER/canónica correspondiente.
