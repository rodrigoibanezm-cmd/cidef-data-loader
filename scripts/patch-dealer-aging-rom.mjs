import fs from 'node:fs';

const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';
const action = 'dealer_inventory_aging_v01';

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const actions = schema.components.schemas.CustomGptRequest.properties.action.enum;
const props = schema.components.schemas.ActionInput.properties;
let changed = false;

if (!actions.includes(action)) {
  actions.push(action);
  const [major, minor] = String(schema.info.version).split('.').map(Number);
  schema.info.version = `${major}.${minor + 1}.0`;
  schema.info.description += ' Includes canonical dealer inventory aging over current vehiculo_canonico state using the previously validated dealer-stock aging contract.';
  schema.components.schemas.ActionInput.description += ' dealer_inventory_aging_v01 accepts optional min_days (default 60, exclusive threshold), as_of, canonical dealer_id/dealer_group_id filters and detail_limit; it uses fecha_ingreso_stock, never fecha_eta, and preserves unresolved dealer identity.';
  changed = true;
}

props.min_days ??= {
  type: 'integer', minimum: 0, default: 60,
  description: 'dealer_inventory_aging_v01 only: exclusive runtime threshold; returns vehicles where aging_days > min_days.',
};
props.as_of ??= {
  type: 'string', format: 'date',
  description: 'dealer_inventory_aging_v01 only: aging reference date YYYY-MM-DD; defaults to CURRENT_DATE.',
};
props.dealer_id ??= {
  type: 'integer', minimum: 1,
  description: 'dealer_inventory_aging_v01 only: optional canonical dealers_master.dealer_id filter.',
};
props.dealer_group_id ??= {
  type: 'integer', minimum: 1,
  description: 'dealer_inventory_aging_v01 only: optional canonical dealer_groups.dealer_group_id filter.',
};

if (changed) fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
if (!motors.includes(`## ${action}`)) {
  motors += `\n\n## ${action}\n\n` +
`**Familia:** 5 — ACCIONABILIDAD  \n**Availability:** AVAILABLE  \n**Version:** 0.1\n\n` +
`Pregunta productiva: ¿qué VIN del stock dealer actual superan un umbral de aging, dónde están y cuál es su contexto operacional?\n\n` +
`Contrato migrado desde el motor legado \`dealer_inventory_aging\`, preservando sus reglas de negocio validadas. La fuente pasa de RAW histórico a \`vehiculo_canonico\`.\n\n` +
`- Universo canónico: \`vigente=true AND canal_salida='DEALER'\`.\n` +
`- Aging: \`aging_days = as_of - fecha_ingreso_stock\`.\n` +
`- No usa \`fecha_eta\`.\n` +
`- La existencia de factura no elimina una unidad del stock dealer; esto preserva la semántica Forum validada.\n` +
`- Umbral parametrizable y exclusivo: \`aging_days > min_days\`; default \`min_days=60\`.\n` +
`- Identidad dealer/grupo usa IDs canónicos; dealer no resuelto se conserva como \`NO_RESUELTO\`, no se descarta.\n` +
`- No define \`stock_disponible\` ni interpreta reservado/tránsito/patio como exclusiones.\n\n` +
`Inputs: \`min_days\`, \`as_of\`, \`dealer_id\`, \`dealer_group_id\`, \`detail_limit\`.\n\n` +
`Outputs: \`summary\`, \`by_dealer\`, detalle VIN acotado y ordenado por mayor aging, \`validation\` y \`warnings\`.\n\n` +
`Validaciones: reconciliación de cobertura con/sin fecha de ingreso, aged <= stock con fecha, detalle acotado y sobre umbral, y preservación explícita de identidad dealer no resuelta.\n`;
  fs.writeFileSync(motorsPath, motors);
}
