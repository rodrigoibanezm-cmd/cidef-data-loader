# MASTER implementation V0.1

## Scope

Physical implementation of the conforming identity layer defined by `MASTER_LAYER_V0.1.md`.
It contains identity only: product, branch, person and dealer. It does not create canonical facts, metrics, marts or analytical motors.

## Execution order

1. `sql/010_master_schema.sql`
2. `sql/master/020_refresh_producto.sql`
3. `sql/master/021_refresh_sucursal_persona.sql`
4. `sql/master/022_refresh_dealer.sql`
5. `sql/master/023_validate_master.sql`

Refreshes are additive. Natural identities are unique and surrogate IDs are generated only on first insert. No refresh drops, truncates, renumbers or deletes historical identities.

## Product

Technical SKU is the strong version identity. Commercial name is a hierarchy attribute and may group several SKUs. Different SKUs are never merged from shared historical VIN evidence.

Current RAW audit before implementation: 241 normalized SKUs; no SKU with multiple observed brands; no SKU with multiple observed commercial names; 22 SKUs without commercial name evidence.

Unresolved SKU/name evidence is written to `master_conflicts` rather than guessed.

## Branch

`ventas_raw.id_sucursal_vta` is the source identity. Current audit: 22 source IDs with one normalized name each. `notas_venta_raw` names resolve only through a unique normalized name already anchored by sales.

`Sucursal Chacabuco` has no source ID and remains an explicit conflict. `vehiculos_raw.bodega` is not used.

## Person

Login is the persistent observed identity. Full name mapping requires simultaneous equality of VIN and nota de venta between `notas_venta_raw` and `vehiculos_raw`.

Current audit: 237 logins; 235 unique login/full-name mappings; 206 have at least 5 concordant observations; 29 have 1-4; `DDROGUETT` and `FMALDONADO` remain without verified full name. Weak mappings are retained with confidence but are not marked validated.

No active/inactive, current role or current branch is inferred.

## Dealer

Dealer identity is persisted by normalized RUT body because direct ERP rows expose the historical RUT body without verifier digit. When a full RUT is observed in a Forum Distribuidora comment, its verifier digit is validated and the identity is upgraded to `rut_validated` without changing `dealer_id`.

The historical dealer catalogue is used only as seed evidence and only inserted when its RUT is observed in current RAW. Forum parsing is conservative: a valid full RUT can enrich an existing dealer; a valid but unknown RUT becomes a conflict and does not silently create a dealer from free text.

`entidad_financiera = FORUM` is never used as a dealer identity rule. Composite names such as `VALDEPEZ SPA // CARPOINT` remain aliases, not two identities.

## Persistence and conflicts

All refresh scripts use `INSERT ... ON CONFLICT DO NOTHING` for identity creation and targeted updates only for newly verified evidence. `master_conflicts` is the common pending-review surface. Missing or ambiguous evidence never causes destructive rebuilds.

## Validation

`023_validate_master.sql` reconciles MASTER counts against RAW identities, checks duplicate natural keys and summarizes pending conflicts. A production deployment is complete only after schema + all refresh scripts execute successfully on Neon `main` and the validation query returns zero duplicate natural keys.
