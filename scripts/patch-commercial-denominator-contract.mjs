import { readFileSync, writeFileSync } from 'node:fs';

const schemaPath = 'rom/schema.json';
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
schema.info.version = '1.52.0';
const metrics = schema.components.schemas.LongitudinalInput.properties.metric.enum;
for (const metric of ['SHARE_WITHIN_COMMERCIAL_UNIVERSE', 'CHANNEL_MIX_WITHIN_CIDEF']) {
  if (!metrics.includes(metric)) metrics.push(metric);
}
schema.components.schemas.LongitudinalInput.description = 'Shared longitudinal input for VENTAS, RVM and CRM. VENTAS and CRM require commercial_universe. VENTAS ratio metrics enforce explicit numerator/denominator universe semantics. Product-scoped RVM queries require explicit organization_scope; MARKET_SIZE remains organization_scope=ALL.';
writeFileSync(schemaPath, `${JSON.stringify(schema)}\n`);

const orchestratorPath = 'rom/orchestrator.md';
let orchestrator = readFileSync(orchestratorPath, 'utf8');
const marker = '\n## 3A. Fijar pertenencia organizacional en RVM\n';
const section = `\n### Semántica de denominadores comerciales\n\nToda razón, share o comparación derivada de VENTAS debe declarar implícita o explícitamente la relación entre el universo del numerador y el del denominador. No dividir universos comerciales distintos salvo que la definición canónica de la métrica autorice exactamente esa relación.\n\nReglas:\n\n\`\`\`text\nVIN_SALES / crecimiento temporal\n→ SAME_UNIVERSE\n→ OWN_STORES(t) contra OWN_STORES(t-1)\n→ DEALERS(t) contra DEALERS(t-1)\n→ COMPANY(t) contra COMPANY(t-1)\n\nSHARE_WITHIN_COMMERCIAL_UNIVERSE\n→ SAME_UNIVERSE\n→ numerador de grain / mismo commercial_universe\n\nCHANNEL_MIX_WITHIN_CIDEF\n→ PART_OF_PARENT\n→ OWN_STORES / COMPANY o DEALERS / COMPANY\n\`\`\`\n\n\`SHARE_WITHIN_CIDEF\` queda como alias legacy de \`SHARE_WITHIN_COMMERCIAL_UNIVERSE\`; no significa automáticamente OWN_STORES/COMPANY.\n\nNo construir \`OWN_STORES market penetration\` ni \`DEALERS market penetration\` dividiendo por RVM total. Mientras no exista un denominador externo certificado del mismo canal, esas métricas son \`NOT_EVALUABLE\`. El contexto RVM puede coexistir como plano paralelo, pero no convertirse silenciosamente en denominador de canal.\n\nInvariante:\n\n\`\`\`text\nnumerator_universe = denominator_universe\nOR canonical metric relation = PART_OF_PARENT / EXTERNAL_COMPATIBLE\notherwise → DOMAIN_MISMATCH or NOT_EVALUABLE\n\`\`\`\n`;
if (!orchestrator.includes('### Semántica de denominadores comerciales')) {
  orchestrator = orchestrator.replace(marker, `${section}${marker}`);
  writeFileSync(orchestratorPath, orchestrator);
}
