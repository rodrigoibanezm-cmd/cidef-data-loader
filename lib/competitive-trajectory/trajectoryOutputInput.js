const OUTPUT_MODES = new Set(['trajectory', 'monthly']);

function parseMode(value) {
  const mode = value == null ? 'trajectory' : String(value).trim().toLowerCase();
  if (!OUTPUT_MODES.has(mode)) {
    throw new Error('output_mode must be trajectory or monthly');
  }
  return mode;
}

function parseEntityKeys(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new Error('entity_keys must contain 1-50 values');
  }
  const keys = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (!keys.length || keys.length > 50) {
    throw new Error('entity_keys must contain 1-50 non-empty values');
  }
  return keys;
}

export function parseTrajectoryOutputInput(input = {}) {
  const outputMode = parseMode(input.output_mode);
  const entityKeys = parseEntityKeys(input.entity_keys);
  if (outputMode === 'monthly' && entityKeys.length === 0) {
    throw new Error('entity_keys is required when output_mode=monthly');
  }
  if (outputMode === 'trajectory' && entityKeys.length) {
    throw new Error('entity_keys is only valid when output_mode=monthly');
  }
  return { outputMode, entityKeys };
}
