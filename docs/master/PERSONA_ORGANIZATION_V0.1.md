# PERSONA_ORGANIZATION_V0.1

## ESTADO

**CONTRATO ORGANIZACIONAL PROVISIONAL — IDENTIDAD PERSONA EN REVISIÓN.**

Las reglas que separan identidad, rol, vigencia y sucursal siguen vigentes.

Los conteos y asignaciones construidos sobre `personas_master` actual NO deben considerarse definitivos hasta cerrar la revisión de cobertura de MASTER V0.1.

## PRINCIPIO

`personas_master` debe conservar identidad persistente.

Rol, vigencia comercial y asignación a sucursal son relaciones separadas y temporales.

Las ventas observadas NO determinan por sí solas el rol organizacional.

## FUENTES

- RAW: identidad e historia observada.
- `Listado vendedores canal directo CIDEF-Junio 2026.xlsx`, recibido como nómina vigente el 2026-08-28: autoridad para vendedores y supervisores de tiendas vigentes.
- `dealer_supervisor`: autoridad vigente para supervisores dealer.
- MASTER histórica: evidencia para detectar identidades candidatas omitidas; NO autoridad automática.

## TABLAS PROPUESTAS

### `personas_master`

Identidad persistente. Su contrato final está pendiente de reconciliación de cobertura.

Puede incorporar RUT, DV, email corporativo y aliases cuando exista evidencia suficiente.

### `persona_roles`

Roles soportados:

- `VENDEDOR_TIENDA`;
- `SUPERVISOR_TIENDA`;
- `SUPERVISOR_DEALER`.

Incluye vigencia temporal + fuente.

### `persona_sucursal`

Relación temporal persona ↔ sucursal para vendedores y supervisores de tiendas.

### `persona_estado_comercial`

Indica pertenencia a fuerza de venta vigente según evidencia organizacional disponible.

Ausencia de vigencia NO elimina identidad histórica.

## EVIDENCIA DE LA IMPLEMENTACIÓN BAJO REVISIÓN

La implementación actual produjo:

- 237 identidades en `personas_master`;
- 70 vendedores de tienda vigentes;
- 7 supervisores de tienda vigentes;
- 2 supervisores dealer vigentes;
- 79 personas vigentes en fuerza de venta;
- 158 identidades clasificadas como históricas/no vigentes;
- 82 asignaciones vigentes persona ↔ sucursal.

Estos números son evidencia del estado implementado, NO certificación de identidad correcta ni cobertura completa.

## CASOS DOCUMENTADOS

### JENIFFER / Antofagasta

La implementación excluyó el registro de nómina sin RUT, correo ni identidad asociable determinísticamente.

Una identidad histórica distinta llamada `JENIFFER VARGAS` NO debe fusionarse sin evidencia adicional.

Este caso debe revalidarse al cerrar identidad persona.

### Angélica Moreno

La implementación relacionó `AMORENO`, RUT 27.520.856-6, con `ANGELICA MARIA MORENO DE MATOS` y registró transición Plaza Sur → Plaza Norte usando nómina + ventas observadas.

La relación organizacional puede conservarse como evidencia, pero depende de que la identidad persona base sobreviva la reconciliación MASTER.

## REGLAS

- Persona histórica NO se elimina por no pertenecer a fuerza vigente.
- Rol histórico NO se inventa por aparición en ventas.
- Login NO debe asumirse persona física sin reconciliación suficiente.
- Nómina vigente puede certificar rol/vigencia actual; NO necesariamente agota universo histórico de personas.
- NO congelar conteos organizacionales hasta validar `personas_master`.
