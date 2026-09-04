# Commercial Scope Governance V0.1

## Principle

Before executing any analysis, the agent must fix and certify the relevant commercial universe. Every downstream motor must operate exclusively inside that domain and may only restrict it; it must never widen or redefine it.

Canonical flow:

```text
question / intent
→ DOMAIN CONTEXT
→ certified domain
→ domain-specific motors
→ integration
```

## VENTAS V0.1

The certified sales universes are:

```text
COMPANY | OWN_STORES | DEALERS
```

The unique authority for commercial destination is:

```text
vehiculo_canonico
```

`ventas_raw` remains the recognition source for whether/when a sale occurred, but it is not allowed to redefine the commercial destination universe.

## Required ordering

```text
DOMAIN
→ FILTER
→ GRAIN
→ METRIC
```

- DOMAIN defines what sales are allowed to exist in the analysis.
- FILTER narrows the certified domain.
- GRAIN controls grouping only.
- METRIC controls calculation only.

Neither FILTER nor GRAIN may change the commercial universe.

## Architecture invariants

1. No downstream consumer may widen the domain it received.
2. No grain may redefine the domain implicitly.
3. No filter may switch commercial universes.
4. Outputs may be integrated only when their scopes are compatible.
5. `DOMAIN_MISMATCH` blocks incompatible integration or analytical requests; it must not degrade silently.

Examples:

```text
OWN_STORES → one store → one brand → one seller   VALID
OWN_STORES → COMPANY                              INVALID
OWN_STORES + grain=DEALER                         DOMAIN_MISMATCH
DEALERS + grain=STORE                             DOMAIN_MISMATCH
```

## Motor

```text
ventas_commercial_context_v01
```

Responsibility: determine and certify the commercial universe on which downstream VENTAS motors may operate.

The public SALES capability is:

```text
SALES / COMMERCIAL_CONTEXT
→ ventas_commercial_context_v01
```

`commercial_universe` is mandatory at the public boundary. The capability fails closed with `MISSING_COMMERCIAL_UNIVERSE` instead of silently defaulting an omitted scope to COMPANY.

Output contract begins with:

```json
{
  "commercial_scope": {
    "universe": "OWN_STORES",
    "authority": "vehiculo_canonico",
    "valid": true,
    "scope_id": "ventas_commercial_context_v01"
  }
}
```

It also exposes scoped sales, coverage and validation information.

## Universe semantics

### COMPANY

All recognized sales are retained. Sales without resolved commercial channel remain explicit residual evidence and are not silently assigned to stores or dealers.

### OWN_STORES

Only sales whose canonical `canal_salida = TIENDA_PROPIA` are admitted. Their commercial destination is `sucursal_venta_id` from `vehiculo_canonico`.

### DEALERS

Only sales whose canonical `canal_salida = DEALER` are admitted. Their commercial destination is `dealer_id` / `dealer_group_id` from `vehiculo_canonico`.

## Current consumers

`ventas_organizational_context_v01` obtains a certified `OWN_STORES` domain before store/seller enrichment. Therefore store contribution, seller contribution, relative performance and deterioration consumers that depend on organizational context inherit the own-store boundary.

`ventas_longitudinal_context_v01` requires an explicit `commercial_universe`. STORE/SELLER analyses require `OWN_STORES`; DEALER/DEALER_GROUP analyses require `DEALERS`. Product grains can operate inside any explicitly selected commercial universe.

The public longitudinal schema permits `commercial_universe = COMPANY | OWN_STORES | DEALERS`; it is required by the VENTAS capability and validated by the backend. `grain` never infers or changes this domain.

## Agent surface

Public OpenAPI V1.50.0 exposes the same semantics already enforced by the backend:

```text
POST /api/custom-gpt/sales
capability = COMMERCIAL_CONTEXT
input.commercial_universe = COMPANY | OWN_STORES | DEALERS
```

and:

```text
POST /api/custom-gpt/longitudinal
capability = VENTAS
input.commercial_universe = COMPANY | OWN_STORES | DEALERS
```

The capability registry, router, public schema and backend therefore share the same domain contract.

## Cross-domain integration

The same contract is intended to be adopted later by CRM and other domains. Integration must compare declared commercial scopes before combining outputs. This version implements the pattern first in VENTAS and does not introduce a generic DOMAIN_CONTEXT abstraction yet.

## Closure status

```text
VENTAS COMMERCIAL SCOPE GOVERNANCE V0.1 = CLOSED
```

Closed means:

- commercial destination authority = `vehiculo_canonico`;
- `COMPANY | OWN_STORES | DEALERS` are certified scopes;
- public `COMMERCIAL_CONTEXT` is exposed;
- public VENTAS longitudinal accepts explicit `commercial_universe`;
- store/seller organizational consumers enter through `OWN_STORES`;
- incompatible grain/domain combinations fail with `DOMAIN_MISMATCH`;
- omitted public scope fails closed rather than silently widening to COMPANY.
