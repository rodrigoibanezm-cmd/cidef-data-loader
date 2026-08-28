# MASTER_IMPLEMENTATION_V0.1

## OBJETIVO

Documentar implementación física y estado verificado de MASTER V0.1.

Contrato lógico: `docs/master/MASTER_LAYER_V0.1.md`.

## SCOPE

Incluye identidad conformada de:

- producto;
- sucursal;
- persona;
- dealer;
- aliases;
- conflictos de identidad.

NO incluye:

- `vehiculo_canonico`;
- `fact_operacion`;
- `fact_venta`;
- `fact_mercado`;
- métricas certificadas;
- marts/cubos;
- motores analíticos.

## ESTADO VERIFICADO

**Neon proyecto:** Cidef.

**Branch:** `main`.

MASTER V0.1 está desplegado y poblado en `main`.

Verificación 2026-08-28:

- `marcas_master`: 6;
- `modelos_master`: 193;
- `versiones_master`: 241;
- `sucursales_master`: 22;
- `personas_master`: 237;
- `dealers_master`: 7;
- `master_conflicts`: 27.

Duplicados observados en claves naturales verificadas:

- marca: 0;
- SKU/version: 0;
- sucursal fuente: 0;
- usuario/persona: 0;
- RUT dealer: 0.

## SQL

Orden de ejecución:

1. `sql/010_master_schema.sql`
2. `sql/master/020_refresh_producto.sql`
3. `sql/master/021_refresh_sucursal_persona.sql`
4. `sql/master/022_refresh_dealer.sql`
5. `sql/master/023_validate_master.sql`

## REFRESH

Refreshes son aditivos.

### REGLAS

- identidad natural única;
- surrogate ID se genera SOLO en primera inserción;
- NO `DROP`;
- NO `TRUNCATE`;
- NO renumerar;
- NO borrar identidad histórica;
- nueva evidencia validada puede enriquecer identidad existente;
- evidencia ambigua → `master_conflicts`.

## PRODUCTO

### IDENTIDAD

SKU técnico normalizado = identidad fuerte de versión.

Nombre comercial = jerarquía/atributo; puede agrupar múltiples SKU.

### EVIDENCIA PREIMPLEMENTACIÓN

- 241 SKU normalizados;
- 0 SKU con múltiples marcas observadas;
- 0 SKU con múltiples nombres comerciales observados;
- 22 SKU sin nombre comercial observado.

### REGLAS

- SKUs distintos NO se fusionan por VIN histórico compartido.
- SKU/nombre no resuelto → conflicto; NO inferir.

## SUCURSAL

### IDENTIDAD

`ventas_raw.id_sucursal_vta` = ancla fuente.

`notas_venta_raw` resuelve nombre SOLO mediante match normalizado único contra sucursal ya anclada.

### EVIDENCIA

- 22 IDs fuente;
- un nombre normalizado por ID en auditoría;
- `Sucursal Chacabuco` sin ID fuente → conflicto.

### REGLA

`vehiculos_raw.bodega` NO participa en identidad de sucursal comercial.

## PERSONA

### IDENTIDAD

Login/código = identidad persistente observada.

### MATCH LOGIN → NOMBRE

Requiere igualdad simultánea entre `notas_venta_raw` y `vehiculos_raw` de:

```text
VIN + nota_de_venta
```

VIN solo NO basta.

### EVIDENCIA PREIMPLEMENTACIÓN

- 237 logins;
- 235 mappings únicos login → nombre;
- 206 con >=5 observaciones concordantes;
- 29 con 1–4;
- `DDROGUETT` y `FMALDONADO` sin nombre verificado.

Mappings débiles pueden persistir con confianza explícita; NO se marcan validados sin cumplir threshold.

### NO INFERIR

- activo/inactivo;
- rol actual;
- sucursal actual.

## DEALER

### IDENTIDAD

RUT normalizado = ancla fuerte.

ERP puede exponer cuerpo RUT histórico sin DV.

RUT completo observado en contexto Forum Distribuidora puede validar/enriquecer identidad existente sin cambiar `dealer_id`.

### REGLAS

- catálogo histórico = seed SOLO si RUT está observado en RAW actual;
- RUT completo Forum válido + dealer existente → enriquecer;
- RUT válido pero desconocido en texto libre → conflicto;
- `entidad_financiera = FORUM` NO identifica dealer;
- nombres compuestos permanecen aliases salvo evidencia de identidades separadas.

## CONFLICTOS

`master_conflicts` es la superficie común de identidad pendiente.

Estado verificado 2026-08-28: 27 conflictos registrados.

Un conflicto NO bloquea identidades deterministas ya resueltas.

NO resolver conflictos mediante interpretación LLM.

## VALIDACIÓN

`sql/master/023_validate_master.sql` debe:

- reconciliar MASTER contra identidades RAW;
- detectar duplicados de claves naturales;
- resumir conflictos pendientes.

### CRITERIO DE INTEGRIDAD

- tablas MASTER existen;
- refresh ejecuta sin reconstrucción destructiva;
- claves naturales verificadas sin duplicados;
- conflictos ambiguos quedan explícitos.

Estado 2026-08-28: criterios estructurales y unicidad verificados en Neon `main`.

## SIGUIENTE CAPA

MASTER V0.1 habilita implementación de capa canónica:

```text
MASTER
→ vehiculo_canonico
→ fact_operacion
→ fact_venta
```

`fact_mercado` requiere contrato independiente antes de implementación.

NO ampliar MASTER para absorber hechos de la capa canónica.
