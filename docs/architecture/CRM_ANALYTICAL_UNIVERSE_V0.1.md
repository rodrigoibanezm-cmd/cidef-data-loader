# CRM analytical universe V0.1

## Architecture

```text
CRM_Cidef_raw
→ defensive deduplication by CRM ID
→ temporal normalization
→ product/store/seller canonical resolution
→ date-effective VENDEDOR_CIDEF eligibility
→ crm_universe_v01
→ CRM family consumers
```

`crm_universe_v01` is an internal runtime-only certified analytical dataset. It is not a public capability, is not materialized in Neon, and does not reconstruct historical CRM state.

## Grain and deduplication authority

Grain: one analytical event per deduplicated CRM lead ID. Deduplication preserves the existing CRM longitudinal policy: latest parseable `loaded_at` first and stable `ctid` technical tie-break. Null/empty IDs remain defensively isolated by `ctid`.

## Commercial universe

- `COMPANY`: every valid deduplicated CRM lead.
- `OWN_STORES`: only leads whose `Sucursal Asignada` resolves exactly through `sucursal_aliases` / `sucursales_master` and whose canonical `tipo_canal = CIDEF`.
- `DEALERS`: unsupported/not evaluable. CRM does not currently provide certified dealer identity sufficient for deterministic attribution.

`Empresa` is not commercial-universe authority.

## Product identity

Identity comes from `Producto de interes`, preserving the existing candidate logic over `producto_aliases_v01`, `versiones_master_v01`, `modelos_master_v01`, and `marcas_master_v01`. CRM raw `Marca` is not used as canonical brand identity. Events retain raw/normalized product interest, match counts, canonical brand/model IDs and names, and resolution status.

## Store and seller identity

`Sucursal Asignada` resolves through the existing canonical store authority. `Asignado a` resolves through the existing person aliases/master authority. Events retain raw/normalized values, match counts, canonical IDs/names, and `RESOLVED | UNRESOLVED | AMBIGUOUS | NOT_APPLICABLE` status.

`eligible_vendedor_cidef` preserves the existing date-effective authority: resolved person + resolved CIDEF store + `VENDEDOR_TIENDA` role/store interval valid at the consumer-selected event date. Activity observed in CRM never creates a seller role.

## Origen and Suborigen

`Origen` and `Suborigen` are first-class observed dimensions. The universe preserves `origin_raw`, `origin_norm`, `suborigin_raw`, and `suborigin_norm`. No campaign/source grouping is invented and no brand/store identity is inferred from Suborigen.

## Operational CRM context

`crm_context_v01` consumes only `crm_universe_v01` and `assembleCrmContextFromUniverse()` is the reusable deterministic operational context assembler for downstream CRM consumers.

`ASSIGNED` is the base operational population. `AVAILABLE` and pre-assignment `UNASSIGNED` are outside this contract.

`MANAGEMENT` and `RESULT` are independent classifications of the same assigned population:

```text
ASSIGNED
├── MANAGEMENT
│   ├── MANAGED
│   └── UNMANAGED
└── RESULT
    ├── SOLD
    ├── NOT_SOLD
    └── UNKNOWN
```

`MANAGED` means `managed_date != null`; `UNMANAGED` means `managed_date == null`. Result classification preserves the existing CRM sold normalization. `SOLD` does not imply `MANAGED`.

The operational context exposes the same deterministic block for the total assigned population and for canonical STORE and SELLER breakdowns when identity evidence is available. It also exposes explicit reconciliations:

- `ASSIGNED = MANAGED + UNMANAGED`.
- `ASSIGNED = SOLD + NOT_SOLD + UNKNOWN`.

`CONVERSION_ON_MANAGED` is defined as `count(SOLD && MANAGED) / count(MANAGED)`. It is not `SOLD / MANAGED`, because SOLD and MANAGEMENT are independent dimensions.

Seller filtering in `crm_context_v01` uses canonical `seller_id` / `persona_id`; no free-name seller matching is introduced.

## Temporal semantics and limitation

The universe parses `Creado el`, `Asignado el`, `Gestionado el`, and `Desistido el` with the pre-existing CRM date parser semantics. Consumers retain `CREATED_AT`, `ASSIGNED_AT`, `MANAGED_AT`, `DESISTED_AT`, `EVENT`, `COHORT`, `MONTH`, `YEAR`, `SAME_DAY`, and `FULL_PERIOD` semantics.

The public CRM longitudinal family distinguishes the two lead clocks explicitly:

- `LEADS_CREATED + EVENT + CREATED_AT`: counts demand-generation events by `created_date`.
- `LEADS_ASSIGNED + EVENT + ASSIGNED_AT`: counts operational assignment events by `assigned_date`.

Neither metric is silently substituted for the other. `LEADS_ASSIGNED` is calculated only over `crm_universe_v01.analytical_events`; it does not query or reconstruct RAW/MASTER state inside the family.

For `crm_context_v01`, `MANAGED / UNMANAGED` and `SOLD / NOT_SOLD / UNKNOWN` describe `CURRENT_STATE`: the current observable state of the population selected by the requested event period. A historical cohort may therefore be selected by an event clock and inspected in its current state, but the context does not assert how that lead was classified at a historical instant.

`CRM_Cidef_raw` does not preserve full historical state transitions. Snapshot/as-of reconstruction remains unsupported and must not be inferred from current state or native event timestamps. The longitudinal consumer continues to reject unsupported snapshot/as-of requests through its existing contract.

## Coverage, validation and lineage

The universe exposes coverage for deduplication, date parsing, product identity, store identity, seller identity, `VENDEDOR_CIDEF`, commercial-universe membership, and raw Origin/Suborigin availability. Deterministic validation reconciles source rows, deduplicated leads, analytical-event counts, identity states, and OWN_STORES membership, preventing accidental multiplication by MASTER joins.

`crm_context_v01` preserves those universe coverage signals and adds operational metric availability for MANAGEMENT and RESULT. STORE and SELLER operational breakdowns preserve explicit identity states rather than silently dropping unresolved, ambiguous, or not-applicable records.

Lineage remains explicit from CRM raw and existing MASTER authorities. No MASTER table is modified.

## Consumers

- `crm_context_v01`: **OPERATIONAL CONTEXT READY**. `assembleCrmContextFromUniverse()` consumes a prepared `crm_universe_v01`, preserves the existing descriptive context, and adds reusable operational metrics, STORE/SELLER breakdowns, canonical seller filtering, coverage, and reconciliation without rereading RAW or MASTER.
- `crm_longitudinal_context_v01`: **MIGRATED**. Consumes `crm_universe_v01.analytical_events`; no local RAW/MASTER reconstruction remains. Public event metrics include `LEADS_CREATED` on `CREATED_AT` and `LEADS_ASSIGNED` on `ASSIGNED_AT`.
- `lib/weekly-projections/crm.js`: **NEEDS_ADAPTATION**. It performs a distinct open-opportunity workflow with fuzzy seller token matching, active-portfolio model matching, and explicit projection linking; migrating it directly would change semantics.
- `lib/motors/import-crm-cidef.js`: **NOT_APPLICABLE**. It is an upstream loader for the source dataset.

No other CRM consumer is migrated by this change.
