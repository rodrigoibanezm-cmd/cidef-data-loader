# RVM analytical universe V0.1

Estado: `AVAILABLE` — runtime only.

## Boundary

`rvm_universe_v01` is an internal certified analytical dataset. It is not a public capability, agent context, a narrative motor, or a materialized Neon table.

```text
rvm_raw
→ certified RVM identity resolution
→ certified temporal organization resolution
→ rvm_universe_v01
→ RVM family motors
```

The universe composes the existing `rvmIdentityResolutionCte`, `rvmModelAliasCtes`, and `rvmOrganizationResolutionCtes` authorities. It does not redefine identity, market measures, candidate universes, or organization membership.

## Authority and output

Each analytical event preserves:

- `fecha`, `cantidad`, analytical year/month;
- raw brand, model and version plus normalized audit keys;
- canonical `brand_id`, `brand_name`, `model_id`, `model_name`, `identity_status` and resolution method;
- `organization_ids`, `organization_bucket`, `organization_resolution_method` and `scope_brand_id`;
- `pais_vin` and the lossless alias `origin`;
- `descripcion_segmento`, `tipo`, `descripcion_tipo`, `region`, `comuna_adquisicion`, and `combustible`;
- source-compatible RVM fields required by migrated calculations.

Lineage is explicit:

- raw source: `rvm_raw`;
- identity: `producto_aliases_v01`, `modelos_master_v01`, `marcas_master_v01`;
- organization: `product_organization_membership`, `organizations_master`;
- historical fallback: `rvm_organization_historical_rule`.

## Organization scope

The existing contract remains unchanged:

`ALL | CIDEF | INDUMOTORA | MACO_TATTERSALL`

Organization is resolved by certified, date-effective model membership when available and by the existing certified historical source rule only as fallback. The output states remain `INCLUDED`, `EXCLUDED_OTHER_ORGANIZATION`, `UNRESOLVED`, and `AMBIGUOUS`.

`organization_scope` is independent from market-universe filters. In particular, Dongfeng is not assigned wholesale to any importer; its multi-importer attribution continues to use the existing model and historical authorities.

## Market universe dimensions

Supported internal filters are the existing product and RVM dimensions:

- canonical brand/model;
- `descripcion_segmento`;
- `descripcion_tipo`;
- `region` / `comuna_adquisicion`;
- `combustible`;
- `origin`, mapped directly and only to `rvm_raw.pais_vin`.

`CHINA` has no special rule. It is one possible `origin` value. No `is_chinese`, `chinese_market`, or origin grouping is created.

Entity filters remain separate from universe filters. Therefore an entity such as Dongfeng never changes the `MARKET_SHARE` denominator by itself; an explicit universe filter such as `origin=CHINA` or `segment=SUV` does.

## Coverage and validation

The runtime dataset exposes quantity-based coverage for product identity, organization resolution, and origin availability. Validation reconciles each coverage partition to total `cantidad`; warnings expose unresolved/ambiguous product identity and unavailable origin without suppressing rows.

## Migrated consumer

| Consumer | Status | Reason |
|---|---|---|
| `rvm_longitudinal_context_v01` | MIGRATED | Its SQL calculation now consumes `rvm_universe_v01`; local RAW reads, alias resolution, MASTER joins, and organization reconstruction were removed. |

The public longitudinal contract remains unchanged for `MARKET_SIZE`, `ENTITY_VIN`, `MARKET_SHARE`, and `RANK`, including dense series, numerator/denominator, `dense_rank`, cutoff, `SAME_DAY / FULL_PERIOD`, breakdown, coverage, warnings, and metadata. `origin` is an additional backward-compatible universe filter.

## Remaining consumer classification

### READY_TO_MIGRATE

| Consumer | Reason |
|---|---|
| `rvm_market_history_v01` | Its series, period totals, raw-dimension breakdowns and optional canonical product breakdowns can calculate directly over the prepared events without changing semantics. |

### NEEDS_ADAPTATION

| Consumer | Reason |
|---|---|
| `competitive_context_v01` | Builds target-dependent segment/type/fuel candidate universes and current CIDEF portfolio targets. |
| `competitive_share_trajectory_v01` | Inherits the target-dependent candidate-universe preparation and monthly ranking rules. |
| `geographic_market_analysis` | Uses paged geography snapshots, `region_propietario`, legacy brand-origin authority, and a `CAMIONETA → PICK-UP` adapter. |
| `rvm_market_pareto` | Uses a latest-month snapshot, legacy origin authority, Pareto thresholding, and its own model ranking. |
| `monthly_seasonality_analysis` | MARKET mode uses raw brand/model labels; CIDEF mode additionally joins RVM vehicle keys to sales notes and applies a distinct observational scope. |
| `market_penetration` / `refresh_market_penetration_monthly` | Depend on materialized monthly ALL/CHINA tables, legacy origin authority, and `CAMIONETA → PICK-UP`. |
| `contextual_slice` (`cube=rvm`) | Generic cube contract exposes additional raw dimensions and 24-month descriptive statistics; it needs an adapter rather than a direct substitution. |
| `active_vehicle_models` / `refresh_active_vehicle_models` | Build mutable latest-month snapshots against legacy vehicle-model tables. |

### NOT_APPLICABLE

| Consumer | Reason |
|---|---|
| `competitive_relation_v01` | Downstream calculation over certified competitive trajectory output; it does not prepare RVM events. |
| `competitive_signal_backtest_v01` | Downstream backtest over competitive pair series. |
| `competitive_inverse_share_movement_v01` | Downstream arithmetic over certified share trajectories. |
| `rvm_quality_audit` | RAW/identity quality audit whose purpose is to inspect the sources and mappings upstream of the universe. |
| `import_rvm` / RVM cleaner/state | Ingestion and RAW publication, upstream of the universe. |
| `refresh_vehicle_models_master` / `refresh_vehicle_versions_master` | MASTER construction and enrichment, upstream of certified analytical identity. |
| product alias refresh/builders | Identity-authority construction, upstream of the universe. |

No remaining consumer is migrated in V0.1.
