# MOTOR SPEC — VIN → PRICE_VERSION → PRICE_HISTORY

Audience: LLM implementing or reviewing the motor. Do not treat this as user-facing documentation.

## Objective

Build a motor that receives:

```json
{
  "vin": "LVAV2MAB5TU475588",
  "fecha": "2026-06-11"
}
```

and returns the applicable commercial price record and all centralized CIDEF bonuses for that VIN at that date.

Expected logical flow:

`VIN -> inventario_vehiculos_global_raw -> homologate price_versions -> latest price_history.vigencia_desde <= fecha -> price + bonuses`

Do not query raw XLS files at runtime. Runtime source of truth is Neon.

## Existing Neon tables

### inventario_vehiculos_global_raw

Use `vin_chasis` as VIN key.

Relevant fields observed:

- `vin_chasis`
- `marca`
- `desc_abrev`
- `tipo_motor`
- `tipo_ficha`
- `norma`
- `peso_bruto`
- `ano`
- `ano_fabricacion`

`desc_abrev` is often the strongest commercial descriptor. Example:

`G7 2.0L MT 4X4 E6 LITE`

### price_versions

Canonical vehicle identity. Current relevant fields:

- `price_version_id`
- `marca`
- `modelo`
- `version`
- `version_raw`
- `source_sheet`
- `transmision`
- `cc`
- `hp`
- `combustible`
- `traccion`
- `carga_kg`
- `pasajeros`
- `euro`
- `fingerprint_status`

`price_version_id` is a stable DB ID. Do not derive it from VIN, price, date or bonuses.

### price_history

Historical commercial values by canonical version and validity date.

Relevant fields:

- `price_version_id`
- `vigencia_desde`
- `precio_neto`
- `precio_lista`
- `precio_con_iva`
- `bono_cidef`
- `bono_forum`
- `bono_mes`
- `raw_payload`
- `source_file`
- `source_sheet`
- `source_row`

Important: some additional bonuses are still only present inside `raw_payload`, e.g. `bono_mil_dolares_s_iva`. The motor must inspect known bonus fields from `raw_payload` until they are promoted to explicit canonical columns.

## Homologation strategy

First retrieve the VIN row from inventory.

Normalize strings only for comparison; preserve original values in output/evidence.

Use evidence from `desc_abrev` plus the technical fingerprint. Recommended matching order:

1. exact/near-exact brand match;
2. model/family tokens from `desc_abrev` vs `modelo`;
3. transmission (`MT`, `AT`, `DCT`, etc.);
4. traction (`4X2`, `4X4`, front/rear where relevant);
5. engine displacement / `cc`;
6. fuel type;
7. EURO norm;
8. trim token (`LITE`, `ULTIMATE`, `E1`, `E2`, etc.).

Use deterministic rules before fuzzy matching. Do not let the LLM invent a match.

If exactly one candidate remains, return that `price_version_id`.

If multiple candidates remain with materially different commercial versions, return `status = ambiguous` and include candidates. Do not choose silently.

If no valid candidate remains, return `status = not_found`.

## Price validity rule

For the resolved `price_version_id`, select:

```sql
WHERE vigencia_desde <= :fecha
ORDER BY vigencia_desde DESC
LIMIT 1
```

Never use a later price list for an earlier invoice/sale date.

## Bonus rule

CIDEF centralizes all applicable bonuses. The amount to return to the dealer is the sum of every applicable bonus in that price row, not only `bono_cidef`.

At minimum include:

- `bono_cidef`
- `bono_forum`
- `bono_mes`
- known extra bonus fields inside `raw_payload` such as `bono_mil_dolares_s_iva`

Treat null, blank and `$-` as zero.

Do not double-count equivalent aliases of the same bonus if the XLS payload contains duplicate representations.

Return both the component breakdown and `bono_total`.

## Required output contract

```json
{
  "status": "ok",
  "vin": "...",
  "fecha": "YYYY-MM-DD",
  "inventory": {
    "marca": "...",
    "desc_abrev": "..."
  },
  "match": {
    "price_version_id": 28,
    "marca": "FOTON",
    "modelo": "G7 LITE",
    "version": "4X4 EURO VI",
    "confidence": "deterministic"
  },
  "vigencia_desde": "YYYY-MM-DD",
  "precio": {
    "precio_neto": 15490000,
    "precio_lista": null,
    "precio_con_iva": null
  },
  "bonos": {
    "bono_cidef": 900000,
    "bono_forum": 600000,
    "bono_mes": 100000,
    "bono_mil_dolares": 900000,
    "bono_total": 2500000
  },
  "evidence": {
    "source_file": "...",
    "source_sheet": "...",
    "source_row": 6
  }
}
```

For `ambiguous` and `not_found`, do not fabricate price or bonus values.

## Known validated example

Input:

```json
{
  "vin": "LVAV2MAB5TU475588",
  "fecha": "2026-06-11"
}
```

Inventory:

- `marca = FOTON`
- `desc_abrev = G7 2.0L MT 4X4 E6 LITE`
- `tipo_motor = Diesel`
- `norma = EURO 6E`

Canonical match:

- `price_version_id = 28`
- `modelo = G7 LITE`
- `version = 4X4 EURO VI`
- `transmision = 6MT`
- `cc = 2.0`
- `combustible = Diesel`
- `traccion = 4X4`
- `euro = 6`

Applicable price row:

- `vigencia_desde = 2026-06-03`
- `precio_neto = 15490000`
- `bono_cidef = 900000`
- `bono_forum = 600000`
- `bono_mes = 100000`
- `raw_payload.bono_mil_dolares_s_iva = 900000`
- total centralized bonuses = `2500000`

Evidence:

`LISTA DE PRECIOS JUNIO 03-06-2026.xlsb`, sheet `FOTON PICKUP`, row `6`.

## Implementation task for the next LLM

1. Inspect the current repo architecture and router conventions before writing code.
2. Implement a dedicated lookup motor; do not overload the import motor.
3. Reuse the existing Neon helper and router conventions.
4. Add the motor to the router allowlist/dispatch.
5. Make input validation strict for VIN and date.
6. Implement deterministic homologation and explicit `ambiguous`/`not_found` states.
7. Return evidence fields for auditability.
8. Add the validated VIN example above as a regression test or executable validation fixture.
9. Do not modify `price_versions` or `price_history` during lookup. This motor is read-only.
10. Before committing, test the example against Neon and verify `bono_total = 2500000`.
