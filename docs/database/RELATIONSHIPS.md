# CIDEF — Database Relationships and Authorities

Estado: **CURRENT**  
Snapshot físico: **2026-09-11**

Este documento distingue relaciones **físicamente garantizadas por FK** de relaciones **lógicas/canónicas** cuya autoridad vive en tablas o contratos específicos.

## 1. Producto

Autoridad vigente:

```text
marcas_master_v01
        ↓ 1:N
modelos_master_v01
        ↓ 1:N
versiones_master_v01
```

Evidencia y pertenencia:

```text
producto_aliases_v01
producto_clasificacion_v01
producto_portafolio_v01
```

Consumidores físicos relevantes:

```text
versiones_master_v01
  ├─ vehiculo_canonico
  ├─ price_episode_canonico_v01
  └─ price_episode_vin_v01

modelos_master_v01
  ├─ forum_operacion_canonica_v01
  └─ weekly_sales_projection
```

Regla: las tablas `marcas_master`, `modelos_master`, `versiones_master` y `producto_aliases` sin `_v01` son LEGACY y no deben mezclarse con la jerarquía vigente.

## 2. Sucursal / dealer

Contrato lógico vigente:

```text
dealer_groups
  ├─ dealers_master
  └─ sucursales_master
```

No existe obligación lógica de que toda sucursal tenga `dealer_id`. Una sucursal puede estar resuelta a `dealer_group_id` sin entidad jurídica demostrada.

Relaciones físicas principales:

```text
dealers_master.dealer_group_id
  → dealer_groups.dealer_group_id

sucursales_master.dealer_group_id
  → dealer_groups.dealer_group_id

sucursales_master.dealer_id
  → dealers_master.dealer_id

sucursal_aliases.sucursal_id
  → sucursales_master.sucursal_id

dealer_aliases.dealer_id
  → dealers_master.dealer_id
```

`vehiculo_canonico` puede referenciar:

```text
sucursal_venta_id
 dealer_id
 dealer_group_id
```

Esas columnas materializan resolución comercial. No deben reconstruirse desde texto RAW si ya están disponibles.

## 3. Persona

Autoridad:

```text
personas_master
  ├─ persona_aliases
  ├─ persona_roles
  ├─ persona_sucursal
  └─ persona_estado_comercial
```

Relaciones organizacionales adicionales:

```text
dealer_supervisor.persona_id
  → personas_master.persona_id

weekly_sales_projection.persona_id
  → personas_master.persona_id

forum_operacion_canonica_v01.persona_id
  → personas_master.persona_id
```

Regla: actividad o ventas no redefinen rol. Rol y asignación se consumen desde las tablas MASTER correspondientes.

## 4. Vehículo canónico

```text
vehiculos_raw
    ↓ canonicalización
vehiculo_canonico
```

Grain físico:

```text
1 fila = 1 vehiculo_id
VIN obligatorio
```

Relaciones físicas:

```text
vehiculo_canonico.version_id
  → versiones_master_v01.version_id

vehiculo_canonico.sucursal_venta_id
  → sucursales_master.sucursal_id

vehiculo_canonico.dealer_id
  → dealers_master.dealer_id

vehiculo_canonico.dealer_group_id
  → dealer_groups.dealer_group_id
```

Esta tabla materializa identidad de vehículo y resolución de salida comercial. Los motores downstream no deben rederivar esa resolución desde RAW.

## 5. Forum

Flujo físico:

```text
forum_raw
  ├─ forum_operacion_canonica_v01
  └─ forum_crm_vin_bridge_v01
```

`forum_raw`:

```text
PK = numero_operacion
```

`forum_operacion_canonica_v01` resuelve una operación Forum hacia:

```text
sucursal_id
persona_id
marca_id
modelo_id
```

y conserva estados explícitos de resolución:

```text
store_resolution_status
seller_resolution_status
product_resolution_status
seller_store_status
```

`forum_crm_vin_bridge_v01` materializa:

```text
numero_operacion
→ crm_deal_id
→ vin
```

junto con método/estado de matching.

Regla: el agente no debe volver a construir Forum↔CRM↔VIN mediante joins ad hoc cuando el bridge cubre esa relación.

## 6. Operación comercial integrada

`commercial_operation_master_v01` tiene grain:

```text
1 fila = 1 commercial_operation_id
```

Materializa en una sola identidad evidencia proveniente de:

```text
FORUM
CRM
VIN / venta
```

Expone, entre otros:

```text
forum_numero_operacion
crm_deal_id
vin
rut_normalizado
sucursal_id
persona_id
marca_id
modelo_id
```

más columnas de evidencia por fuente y estados de matching:

```text
forum_present
crm_present
vin_present
forum_crm_match_status
crm_vin_match_status
identity_status
```

No tiene FK físicas hacia todas sus autoridades. Por ello, su relación es **materializada/lógica**, no una licencia para inferir nuevas equivalencias fuera de los métodos certificados que la construyen.

## 7. CRM ↔ venta

`crm_cidef_venta_link_v01` materializa evidencia de enlace entre:

```text
CRM deal
↔ VIN
↔ datos ERP/venta
```

Campos de control relevantes:

```text
status
match_method
crm_erp_day_gap
validation_status
```

No posee PK/FK físicas en el snapshot. Debe tratarse como bridge materializado, no como dimensión de identidad.

## 8. Pricing

Flujo físico:

```text
price_versions
      ↓
price_history
      ↓ canonicalización temporal
price_episode_canonico_v01
      ↓
price_episode_vin_v01
```

Relaciones:

```text
price_history.price_version_id
  → price_versions.price_version_id

price_episode_canonico_v01.price_version_id
  → price_versions.price_version_id

price_episode_canonico_v01.version_id
  → versiones_master_v01.version_id

price_episode_vin_v01.price_episode_id
  → price_episode_canonico_v01.price_episode_id

price_episode_vin_v01.vehiculo_id
  → vehiculo_canonico.vehiculo_id
```

`price_import_staging` queda fuera de la autoridad analítica.

## 9. Proyecciones

Flujo:

```text
weekly_sales_projection_staging
      ↓ normalización / resolución
weekly_sales_projection
```

La tabla normalizada referencia:

```text
sucursal_id → sucursales_master
persona_id  → personas_master
modelo_id   → modelos_master_v01
```

El staging conserva evidencia raw y no debe consultarse como fuente canónica cuando la fila ya fue normalizada.

## 10. RVM y pertenencia organizacional

`rvm_raw` es evidencia de mercado.

La pertenencia de producto a organizaciones no debe inferirse desde campos RAW cuando existen autoridades explícitas:

```text
organizations_master
product_organization_membership
rvm_organization_historical_rule
```

`rvm_organization_historical_rule` permite reglas temporales certificadas para RVM y referencia físicamente:

```text
brand_id → marcas_master_v01.marca_id
organization_id → organizations_master.organization_id
```

## 11. Tablas operacionales

### Tienda

```text
store_challenges
  → store_actions
      → store_action_events
```

Estas tablas almacenan estado de workflow y evidencia de origen. No redefinen resultados analíticos.

### Bonos / documentos

Núcleo relacional:

```text
bonus_requests
  ├─ bonus_request_documents
  │    ├─ bonus_request_reviews
  │    └─ bonus_document_pages
  └─ bonus_request_reviews
```

Las tablas `bonus_*_extractions` y `bonus_*_audits` conservan resultados y auditorías del proceso documental.

## 12. Relaciones que NO deben reconstruirse

Si existe una autoridad física/canónica, no reconstruir manualmente:

```text
RAW producto → identidad producto       => MASTER V0.1
texto sucursal → sucursal               => sucursal_aliases / MASTER
texto vendedor → persona                => persona_aliases / MASTER
VIN → producto/canal/salida             => vehiculo_canonico
Forum → identidad resuelta              => forum_operacion_canonica_v01
Forum → CRM/VIN                         => forum_crm_vin_bridge_v01
CRM → venta/VIN                         => crm_cidef_venta_link_v01
Forum+CRM+VIN → operación integrada     => commercial_operation_master_v01
pricing histórico → episodio            => price_episode_canonico_v01
episodio → VIN facturado                => price_episode_vin_v01
```

Principio rector: **NO RECONSTRUCTION**.
