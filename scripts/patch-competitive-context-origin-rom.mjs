import fs from 'node:fs';

const path = 'rom/motors.md';
let text = fs.readFileSync(path, 'utf8');
const start = text.indexOf('### `competitive_context_v01`');
const end = text.indexOf('### `competitive_share_trajectory_v01`');
if (start < 0 || end < 0 || end <= start) throw new Error('competitive ROM section not found');
let section = text.slice(start, end);

if (!section.includes('origin_group?: CHINESE')) {
  section = section.replace(
    'geography?:\n  level: region | comuna\n  values: string[]\n```',
    'geography?:\n  level: region | comuna\n  values: string[]\norigin_group?: CHINESE | NON_CHINESE | UNKNOWN\n```',
  );
}
if (!section.includes('data/market-origin/CL.json')) {
  section = section.replace(
    'producto_portafolio_v01\n```',
    'producto_portafolio_v01\ndata/market-origin/CL.json\n```',
  );
}
if (!section.includes('el filtro `origin_group`')) {
  section = section.replace(
    '- los universos se observan desde `descripcion_segmento + descripcion_tipo + combustible` de RVM;\n',
    '- los universos se observan desde `descripcion_segmento + descripcion_tipo + combustible` de RVM;\n- el filtro `origin_group` es opcional y se deriva del lookup Chile versionado; CN→CHINESE, país mapeado no-CN→NON_CHINESE y missing→UNKNOWN;\n- cuando se solicita `origin_group`, `units`, `rank`, `share` y `cumulativeShare` se recalculan dentro del peer group filtrado;\n',
  );
}
text = `${text.slice(0, start)}${section}${text.slice(end)}`;
fs.writeFileSync(path, text);
