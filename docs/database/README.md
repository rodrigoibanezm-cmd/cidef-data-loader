# CIDEF Database Documentation

Estado: **CURRENT**

Snapshot físico revisado contra Neon `cidef_data / main` el **2026-09-11**.

## Propósito

Este directorio documenta la **base de datos que consume y soporta el runtime analítico actual**.

La base de datos es evidencia física. Esta documentación permite responder:

> qué tablas existen → qué representa cada una → cuál es su grain → qué autoridad tiene → cómo se relaciona con las demás

No reemplaza la documentación semántica de `docs/architecture/`, `docs/master/`, `docs/canonical/` ni los contratos públicos de `rom/schema.json`.

## Jerarquía de autoridad

```text
Neon / esquema físico vigente
        ↓
MASTER y tablas canónicas certificadas
        ↓
universos/contextos internos del runtime
        ↓
capabilities deterministas
        ↓
agente
```

Reglas:

- una tabla existente no es automáticamente una autoridad de negocio;
- RAW conserva evidencia fuente;
- MASTER resuelve identidad;
- CANONICAL materializa entidades/hechos reconciliados;
- BRIDGE materializa relaciones entre fuentes;
- ANALYTICAL materializa estructuras derivadas para análisis;
- OPERATIONAL soporta workflows y estado operativo;
- STAGING/TEMP no debe usarse como autoridad analítica;
- LEGACY puede permanecer físicamente, pero no pertenece al contrato vigente.

## Capas físicas actuales

### 1. RAW

Evidencia fuente sin semántica canónica propia:

```text
CRM_Cidef_raw
forum_raw
notas_venta_raw
rvm_raw
vehiculos_raw
ventas_raw
```

### 2. MASTER

Identidad y pertenencia compartida:

```text
marcas_master_v01
modelos_master_v01
versiones_master_v01
producto_aliases_v01
producto_clasificacion_v01
producto_portafolio_v01

sucursales_master
sucursal_aliases

dealer_groups
dealers_master
dealer_aliases
dealer_supervisor

personas_master
persona_aliases
persona_roles
persona_sucursal
persona_estado_comercial

organizations_master
product_organization_membership
rvm_organization_historical_rule
master_conflicts
```

Las tablas producto sin sufijo `_v01` son **LEGACY** según `docs/master/MASTER_LAYER_V0.1.md`:

```text
marcas_master
modelos_master
versiones_master
producto_aliases
```

### 3. CANONICAL / BRIDGE

Entidades y vínculos reconciliados:

```text
vehiculo_canonico
forum_operacion_canonica_v01
forum_crm_vin_bridge_v01
crm_cidef_venta_link_v01
commercial_operation_master_v01
price_episode_canonico_v01
price_episode_vin_v01
```

`commercial_operation_master_v01` integra evidencia operacional de FORUM, CRM y VIN/venta en una identidad de operación común. Su existencia física no autoriza al agente a reconstruir joins equivalentes ad hoc.

### 4. PRICING

```text
price_versions
price_history
price_episode_canonico_v01
price_episode_vin_v01
price_import_staging
```

`price_import_staging` es STAGING y no es autoridad analítica.

### 5. PROYECCIONES

```text
weekly_sales_projection
weekly_sales_projection_staging
```

`weekly_sales_projection` es la tabla normalizada; `weekly_sales_projection_staging` conserva evidencia previa a resolución.

### 6. ANALYTICAL / DERIVED

```text
market_penetration_monthly_all
market_penetration_monthly_china
```

Actualmente existen físicamente pero están vacías en el snapshot revisado. Su presencia no debe interpretarse como capability vigente por sí sola.

### 7. OPERATIONAL

Workflow de desafíos/acciones de tienda:

```text
store_challenges
store_actions
store_action_events
```

Workflow de bonos/documentación:

```text
bonus_requests
bonus_request_documents
bonus_request_reviews
bonus_request_events
bonus_document_pages
bonus_*_extractions
bonus_*_audits
bonus_auditors
```

Estas tablas soportan procesos operativos. No forman parte automáticamente del contrato del runtime analítico CIDEF.

### 8. TEMP / TEST

```text
crm_cidef_tmp
crm_cidef_vin_tests
```

No deben consumirse como autoridad productiva.

## Documentos

- [Catálogo completo de tablas](./TABLE_CATALOG.md)
- [Relaciones y autoridades](./RELATIONSHIPS.md)
- Referencia histórica de algunos RAW: [`../schemas/`](../schemas/)
- Contrato MASTER: [`../master/MASTER_LAYER_V0.1.md`](../master/MASTER_LAYER_V0.1.md)
- Contratos canónicos: [`../canonical/`](../canonical/)

## Regla de mantenimiento

Esta documentación describe **lo que existe**.

Cuando cambie el esquema de Neon:

1. verificar el estado físico real;
2. actualizar este catálogo;
3. marcar explícitamente tablas reemplazadas como `LEGACY`, `TEMP` o `OUT_OF_RUNTIME_SCOPE`;
4. no promover una tabla a autoridad solo porque fue creada;
5. no documentar diseños futuros como si existieran.
