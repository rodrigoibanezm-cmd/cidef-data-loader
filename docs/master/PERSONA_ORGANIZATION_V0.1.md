# PERSONA_ORGANIZATION_V0.1

## Principio

`personas_master` conserva identidad persistente. Rol, vigencia comercial y asignación a sucursal son relaciones separadas y temporales.

Las ventas observadas NO determinan el rol organizacional.

## Fuentes

- RAW: identidad e historia observada.
- `Listado vendedores canal directo CIDEF-Junio 2026.xlsx`, recibido como nómina vigente el 2026-08-28: autoridad para vendedores y supervisores de tiendas vigentes.
- `dealer_supervisor`: autoridad vigente para supervisores dealer.

## Tablas

### personas_master

Se agregan `rut_normalizado`, `rut_dv` y `email_corporativo` cuando existe evidencia corporativa.

### persona_roles

Roles soportados:

- `VENDEDOR_TIENDA`
- `SUPERVISOR_TIENDA`
- `SUPERVISOR_DEALER`

Incluye `vigente`, `valid_from`, `valid_to` y `fuente`.

### persona_sucursal

Relación temporal persona ↔ sucursal para vendedores y supervisores de tiendas.

### persona_estado_comercial

Indica si la persona pertenece a la fuerza de venta vigente en el snapshot conocido. La ausencia de vigencia NO elimina la identidad histórica.

## Estado verificado 2026-08-28

- 237 identidades persistentes en `personas_master`.
- 70 vendedores de tienda vigentes.
- 7 supervisores de tienda vigentes.
- 2 supervisores dealer vigentes.
- 79 personas vigentes en fuerza de venta en total.
- 158 identidades históricas/no vigentes en la fuerza de venta actual.
- 82 asignaciones vigentes persona ↔ sucursal: 70 de vendedor y 12 de supervisor.

## Casos resueltos

### JENIFFER / Antofagasta

Se excluye de la nómina canónica: registro sin RUT, sin correo y sin identidad asociable de forma determinista. Se registra conflicto rechazado para auditoría. Una persona histórica distinta llamada `JENIFFER VARGAS` permanece en MASTER y NO se fusiona con este registro.

### Angélica Moreno

Una sola identidad: `AMORENO`, RUT 27.520.856-6. La nómina corporativa actualiza su nombre canónico a `ANGELICA MARIA MORENO DE MATOS`.

Asignaciones:

- Plaza Sur: histórica, `valid_to = 2026-06-30`.
- Plaza Norte: vigente.

La transición está respaldada por nómina + ventas observadas: última venta Plaza Sur 2026-06-30 y ventas posteriores en Plaza Norte.

## Regla histórica

Personas antiguas permanecen en `personas_master`. No se les asigna un rol organizacional histórico por el solo hecho de aparecer vendiendo en RAW. Su actividad histórica será preservada por los hechos canónicos; el rol solo se materializa cuando existe evidencia organizacional suficiente.
