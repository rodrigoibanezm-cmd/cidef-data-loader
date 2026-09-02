import fs from 'node:fs';

const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';

function bumpPatch(version) {
  const [major, minor, patch] = String(version).split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const input = schema.components.schemas.ActionInput;
const marker = 'deterioration v0.4 uses sparse observation semantics';
if (!input.description.includes(marker)) {
  schema.info.version = bumpPatch(schema.info.version);
  schema.info.description = schema.info.description.replace(
    'bounded organization sales deterioration backtesting',
    'bounded organization sales deterioration backtesting with sparse observation semantics',
  );
  input.description = input.description.replace(
    'org_sales_deterioration_backtest_v01 requires grain, start_month, end_month and the three candidate arrays.',
    `org_sales_deterioration_backtest_v01 requires grain, start_month, end_month and the three candidate arrays; ${marker}: tienda uses NV-backed ACTIVE_ZERO while other missing months remain UNKNOWN and vendedor stays positive-only/UNKNOWN until independent activity evidence exists.`,
  );
}
fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
const start = motors.indexOf('### `org_sales_deterioration_backtest_v01`');
const auditStart = motors.indexOf('### `org_sales_observation_semantics_audit_v01`', start);
if (start < 0 || auditStart < 0) throw new Error('deterioration ROM section not found');
let section = motors.slice(start, auditStart);
section = section.replace('Versión interna actual: `0.3`.', 'Versión interna actual: `0.4`.');
if (!section.includes('Semántica de observación V0.4')) {
  const anchor = 'Candidatos de baseline:';
  const policy = `Semántica de observación V0.4:\n\n\`\`\`text\nTIENDA\nrecognized_sales > 0 → OBSERVED_POSITIVE → sales real\nrecognized_sales = 0 + NV > 0 → ACTIVE_ZERO → sales = 0\nsin venta ni NV → UNKNOWN → no evaluable\n\nVENDEDOR\nrecognized_sales > 0 → OBSERVED_POSITIVE\nsin venta → UNKNOWN\nACTIVE_ZERO no se fabrica sin fuente independiente certificada\n\`\`\`\n\n- UNKNOWN nunca se convierte en cero;\n- las baselines consumen sólo meses realmente observados/ACTIVE_ZERO y no densifican huecos;\n- UNKNOWN corta continuidad de \`consecutive_k\`, \`frequency_n_of_k\` y \`deepening_k\`;\n- el output expone \`observation_semantics\` y \`coverage.skipped_unknown_actual_by_baseline\`;\n- la identidad NV de tienda reutiliza la misma resolución MASTER y parser temporal validados por \`org_sales_observation_semantics_audit_v01\`.\n\n`;
  section = section.replace(anchor, `${policy}${anchor}`);
}
section = section.replace(
  /La versión 0\.3 \*\*no cambia\*\*[\s\S]*?evidencia comparable entre candidatos por unidad\.\n/,
  'La versión 0.4 cambia exclusivamente la semántica de observación/missingness del backtest: elimina zero-fill implícito, incorpora ACTIVE_ZERO certificado por NV para tienda y preserva UNKNOWN como no evaluable. No cambia fórmulas de desviación, candidatos de persistencia, reconocimiento LAST-by-VIN ni identidad comercial.\n',
);
motors = `${motors.slice(0, start)}${section}${motors.slice(auditStart)}`;
motors = motors.replace(
  'Esta capacidad existe sólo para decidir si la semántica `OBSERVED_POSITIVE / ACTIVE_ZERO / UNKNOWN` debe incorporarse posteriormente al motor productivo. No cambia todavía la versión 0.3 de `org_sales_deterioration_backtest_v01` ni su comportamiento.',
  'Esta capacidad conserva la evidencia diagnóstica que validó `OBSERVED_POSITIVE / ACTIVE_ZERO / UNKNOWN` antes de incorporarla a `org_sales_deterioration_backtest_v01` v0.4. Sigue siendo AUDIT_ONLY y no selecciona la regla final de deterioro.',
);
fs.writeFileSync(motorsPath, motors);
