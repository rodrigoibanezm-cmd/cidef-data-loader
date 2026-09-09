# RVM analytical universe V0.1

Estado: `AVAILABLE` — runtime only.

## Boundary

`rvm_universe_v01` is an internal certified analytical dataset. It is not a public capability, agent context, a narrative motor, or a materialized Neon table.

```text
rvm_raw
→ certified RVM identity resolution
→ certified temporal organization resolution
→ rvm_universe_v01
→ analytical_events
→ RVM family motors
```

The universe composes the existing `rvmIdentityResolutionCte`, `rvmModelAliasCtes`, and `rvmOrganizationResolutionCtes` authorities. It does not redefine identity, market measures, candidate universes, or organization membership.

`buildRvmUniverse()` owns the runtime DB/SQL preparation boundary. Downstream family motors receive its completed dataset and do not compose its CTEs or execute its query.

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
- organization for CIDEF detail: strict raw source `rvm_raw.marca = 'DFM'`;
- organization for other certified organization scopes: `product_organization_membership`, `organizations_master`, with historical fallback where applicable;
- CIDEF historical aggregate authority: `rvm_organization_historical_rule` only when `aggregation_scope = 'BRAND_AGGREGATE'`.

## Organization scope

The public organization-scope enum remains:

`ALL | CIDEF | INDUMOTORA | MACO_TATTERSALL`

### CIDEF — certified granularity boundary

CIDEF has two distinct RVM attribution semantics and they must never be mixed.

**Detail / product / model / competitive attribution**

- CIDEF is only raw RVM brand `DFM`.
- `rvm_universe_v01` with `organization_scope=CIDEF` therefore includes only rows where `master_norm(rvm_raw.marca) = 'DFM'`.
- Canonical DONGFENG identity, model membership, aliases, or historical organization rules cannot grant CIDEF detail inclusion.
- Raw brands such as `ZNA`, `DONGFENG`, `DONG FENG`, `DFMSK`, or any other non-DFM value are not CIDEF detail observations.
- This invariant applies to model/product breakdowns and the competitive family.

**Historical aggregate attribution**

- Certified rows in `rvm_organization_historical_rule` with `aggregation_scope='BRAND_AGGREGATE'` remain valid for aggregate historical CIDEF volume when their temporal rule matches.
- This allows historical brands such as `ZNA` to contribute to an aggregate CIDEF historical total when explicitly consumed by an aggregate-only analysis.
- Aggregate historical authority must not resolve or attribute model/product detail and must not feed competitive target-model identity.
- `rvm_universe_v01` is a detail-capable universe and therefore does not use these historical aggregate rules to grant CIDEF inclusion. Its lineage exposes the aggregate authority separately for auditability.

For `INDUMOTORA` and `MACO_TATTERSALL`, organization attribution continues to use certified date-effective model membership and the certified historical source rule as fallback.

`organization_scope` remains independent from market-universe filters.

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

For CIDEF detail, organization inclusion must reconcile to the strict raw DFM attribution for the same temporal and market filters. Historical `BRAND_AGGREGATE` rules are outside that detail reconciliation and are available only to explicit aggregate historical consumers.

## Migrated consumer

| Consumer | Status | Reason |
|---|---|---|
| `rvm_longitudinal_context_v01` | MIGRATED | It consumes the runtime output of `buildRvmUniverse()` and calculates only over `analytical_events`; DB access, SQL/CTE composition, local RAW reads, alias resolution, MASTER joins, and organization reconstruction were removed from the motor. |

The public longitudinal contract remains unchanged for `MARKET_SIZE`, `ENTITY_VIN`, `MARKET_SHARE`, and `RANK`, including dense series, numerator/denominator, `dense_rank`, cutoff, `SAME_DAY / FULL_PERIOD`, breakdown, coverage, warnings, and metadata. `origin` is an additional backward-compatible universe filter.

## Remaining consumer classification

### READY_TO_MIGRATE

| Consumer | Reason |
|---|---|
| `rvm_market_history_v01` | Its series, period totals, raw-dimension breakdowns and optional canonical product breakdowns can calculate directly over the prepared events without changing semantics. Any future CIDEF aggregate-history mode must explicitly consume only `BRAND_AGGREGATE` historical authority and must remain separate from product/model detail. |

### NEEDS_ADAPTATION

| Consumer | Reason |
|---|---|
| `competitive_context_v01` | Builds target-dependent segment/type/fuel candidate universes and current CIDEF portfolio targets. Its CIDEF target attribution is raw DFM-only. |
| `competitive_share_trajectory_v01` | Inherits the target-dependent candidate-universe preparation and monthly ranking rules. Its CIDEF target attribution is raw DFM-only. |
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
