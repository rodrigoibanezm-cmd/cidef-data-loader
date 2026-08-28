# BUSINESS AGENT V0.1

## Propósito

Definir la bajada a negocio del agente Cidef.

El agente no debe ser un sistema de reportería. Debe ayudar a responder preguntas de negocio concretas, explicar desviaciones relevantes y señalar dónde conviene gestionar.

La arquitectura técnica, tablas, cubos y motores quedan subordinados a esas preguntas.

## Caso de uso principal: reunión de los martes

La reunión de los martes es el primer caso de uso prioritario.

Cada supervisor tiene a cargo aproximadamente dos tiendas y debe responder por:

- ventas acumuladas;
- negocios que considera prácticamente cerrados;
- estimación de cierre de mes.

Hoy esa “proyección” no es una proyección real. Normalmente corresponde a ventas realizadas más negocios casi seguros.

Esto genera tres problemas:

1. los supervisores tienden a comprometer números conservadores;
2. una parte importante de las ventas se concentra en los últimos días del mes;
3. la empresa administra el mes con una visión atrasada respecto de lo que realmente puede ocurrir.

## Fuentes disponibles

### ERP

La tabla `vehiculos_raw` contiene granularidad suficiente para analizar:

- VIN;
- marca;
- modelo;
- vendedor;
- nota de venta y fecha;
- factura y fecha;
- cliente;
- reservas;
- entregas;
- tránsito;
- stock;
- etapa;
- vigencia;
- otras señales operativas anteriores a la factura.

El ERP permite analizar ventas, comportamiento histórico y señales previas al cierre.

### RVM

RVM permite analizar el mercado automotor y la posición competitiva mediante:

- participación de mercado;
- ranking de marcas;
- evolución temporal;
- segmentos;
- modelos;
- regiones y comunas;
- VIN y otras dimensiones.

## Fuentes futuras

### CRM

Pilot actualmente presenta limitaciones de acceso y Salesforce todavía está en implementación.

Por lo tanto, no debe asumirse que existe hoy un pipeline comercial completo y confiable.

### Forum / Finex

Forum participa en una fracción importante de las ventas financiadas de Cidef y dispone de señales comerciales anteriores a la factura.

La futura integración mediante SFTP será especialmente valiosa para mejorar la proyección de cierre y observar operaciones que no dejan huella suficiente en el CRM de Cidef.

No debe considerarse disponible para la primera versión de la reunión de los martes.

## Principio de diseño

La estructura esperada es:

**Cubo semántico común → motores deterministas por familia de preguntas → auditores/validadores compartidos → LLM que selecciona y explica.**

El LLM no calcula indicadores críticos.

Los motores deben ser responsables de producir evidencia determinista.

## Valor esperado

El agente debe poder evolucionar desde:

> “¿Cuánto llevamos?”

hacia:

> “¿Qué debería estar ocurriendo, qué está ocurriendo realmente, qué tan significativa es la diferencia y dónde conviene intervenir?”
