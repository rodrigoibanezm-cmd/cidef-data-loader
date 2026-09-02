const OUTPUT_MODES = new Set(['summary', 'pair_detail']);

function parseMode(value) {
  const mode = value == null ? 'summary' : String(value).trim().toLowerCase();
  if (!OUTPUT_MODES.has(mode)) {
    throw new Error('output_mode must be summary or pair_detail');
  }
  return mode;
}

function parsePairKeys(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new Error('pair_keys must contain 1-50 values');
  }
  const keys = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (!keys.length || keys.length > 50) {
    throw new Error('pair_keys must contain 1-50 non-empty values');
  }
  return keys;
}

export function parseBacktestOutputInput(input = {}) {
  const outputMode = parseMode(input.output_mode);
  const pairKeys = parsePairKeys(input.pair_keys);
  if (outputMode === 'pair_detail' && pairKeys.length === 0) {
    throw new Error('pair_keys is required when output_mode=pair_detail');
  }
  if (outputMode === 'summary' && pairKeys.length) {
    throw new Error('pair_keys is only valid when output_mode=pair_detail');
  }
  return { outputMode, pairKeys };
}
