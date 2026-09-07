# VENTAS analytical universe V0.1

Estado: `AVAILABLE` — runtime only.

## Boundary

`ventas_universe_v01` is an internal certified analytical dataset, not a public Custom GPT capability and not agent context.

```text
ventas_context_v01
→ ventas_commercial_context_v01
→ ventas_universe_v01
→ VENTAS family motors
```

It composes existing rules. It does not redefine sold VIN recognition, MASTER identity, `VENDEDOR_CIDEF`, or `COMPANY / OWN_STORES / DEALERS`.

## Input and authority

- `commercial_universe`: `COMPANY | OWN_STORES | DEALERS`.
- cutoff: existing `cutoff_date` or `cutoff_month` semantics.
- commercial authority: `vehiculo_canonico` through `ventas_commercial_context_v01`.
- recognition authority: `ventas_context_v01`.

No table is materialized in Neon.

## Output

The runtime dataset exposes:

- `analytical_events`: recognized sales enriched once with certified commercial destination, organization, dealer/group, product/model/version and date-effective seller membership;
- explicit `commercial_universe`, requested/effective cutoff and lineage;
- recognition, commercial and resolution coverage;
- validation and explicit resolution states;
- the existing product resources required by compatible adapters.

Canonical destination fields are preserved as `certified_*`. Existing analytical aliases remain available where required for exact public-contract compatibility.

## Invariant

A migrated consumer receives its rows from `ventas_universe_v01`. It does not reload RAW or MASTER to decide commercial membership or repeat a resolution already supplied by the universe.

## Migrated consumers

| Consumer | Migration |
|---|---|
| `ventas_longitudinal_context_v01` | Direct |
| `ventas_organizational_context_v01` | Direct adapter over enriched events |
| `ventas_store_change_contribution_v01` | Transitive through organizational context |
| `ventas_seller_change_contribution_v01` | Transitive through organizational context |
| `organizational_relative_performance_v01` | Transitive through organizational context |
| `organizational_share_expectation_backtest_v01` | Transitive through organizational context |
| `ventas_product_model_resolution_v01` | Transitive through shared product-resolution context |
| `ventas_product_concentration_v01` | Transitive through shared product-resolution context |
| `ventas_product_change_contribution_v01` | Transitive through shared product-resolution context |
| `ventas_product_sales_v01` | Transitive through alias-compatible product adapter |
| `ventas_product_detail_v01` | Transitive through alias-compatible product adapter |
| `vin_growth_diagnostic_v01` | Transitive through longitudinal VENTAS |
| `ventas_monthly_actual_v01` | Direct through shared certified monthly adapter |
| `ventas_daily_context_v01` | Direct through shared certified monthly adapter with `cutoff_date` |
| `expected_monthly_candidates_v01` | Direct through shared certified monthly adapter |
| `expected_monthly_backtest_v01` | Direct through shared certified monthly adapter |
| `expected_monthly_stability_v01` | Direct through shared certified monthly adapter and backtest calculation |

## Remaining consumers

`READY_TO_MIGRATE`: none. The five consumers previously classified here now use `buildVentasMonthlyAnalyticalContext`, which adapts one `COMPANY` universe into the unchanged `ventas_context_v01` monthly shape.

### NEEDS_ADAPTATION

| Consumer | Reason |
|---|---|
| `ventas_daily_organizational_context_v01` | Must preserve its daily output adapter while removing local organization loading. |
| `daily_close_backtest_context_v01` | Reconstructs multiple historical recognition snapshots, not one cutoff dataset. |
| `daily_close_forecast_v01` | Builds intramonth recognition state from source rows. |
| `daily_close_forecast_backtest_v01` | Requires walk-forward snapshots across many cutoffs. |
| `current_month_close_forecast_v01` | Combines live and historical cutoff states plus roster densification. |
| `intramonth_sales_history_context_v01` | Requires daily historical snapshots rather than the universe's single effective cutoff. |
| `predictability_day_v01` | Inherits the multi-cutoff walk-forward dependency from the forecast backtest. |
| `org_sales_deterioration_*` | Runtime rebuilds cutoff snapshots and observation semantics across history. |

### NOT_APPLICABLE

| Consumer | Reason |
|---|---|
| `ventas_commercial_context_v01` | Upstream commercial selector composed by the universe. |
| `ventas_identity_coverage_v01` | Source/Master identity audit, not a family calculation over certified events. |
| `ventas_monthly_dedup_sensitivity_v01` | Intentionally compares alternate recognition rules. |
| `ventas_cross_month_first_last_audit_v01` | Recognition audit over RAW evidence. |
| `ventas_hybrid_unresolved_sensitivity_v01` | Sensitivity audit over unresolved RAW evidence. |
| `ventas_unresolved_recognition_evidence_v01` | Evidence audit whose purpose is to inspect recognition inputs. |
| `org_sales_observation_semantics_audit_v01` | Audit product requiring raw NV/identity evidence beyond the certified event dataset. |
| `product_generation_context_v01` | MASTER generation-membership context; it does not calculate over recognized sales. |

## Regression evidence

`test/ventas-universe.test.js` verifies scope counts/reconciliation, commercial coverage, field equivalence to the former longitudinal enrichment, product/model/version identity, date-effective `VENDEDOR_CIDEF`, VIN series, share metrics, channel mix, and STORE/DEALER/SELLER domain boundaries.

`test/ventas-universe-ready-consumers.test.js` compares legacy and universe-adapted outputs for monthly actual, daily context, candidate values/order, historical backtest observations/metrics and stability windows. It also verifies structurally that the five consumers no longer import local recognition or identity loaders.
