const OUTPUT_MODES = new Set(['summary', 'pair_detail']);
const DEFAULT_PAIR_LIMIT = 20;
const MAX_PAIR_LIMIT = 50;

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

function parseOffset(value) {
  if (value == null) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('pair_offset must be a non-negative integer');
  }
  return parsed;
}

function parseLimit(value) {
  if (value == null) return DEFAULT_PAIR_LIMIT;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_PAIR_LIMIT) {
    throw new Error(`pair_limit must be an integer between 1 and ${MAX_PAIR_LIMIT}`);
  }
  return parsed;
}

export function parseBacktestOutputInput(input = {}) {
  const outputMode = parseMode(input.output_mode);
  const pairKeys = parsePairKeys(input.pair_keys);
  if (outputMode === 'pair_detail') {
    if (pairKeys.length === 0) {
      throw new Error('pair_keys is required when output_mode=pair_detail');
    }
    if (input.pair_offset != null || input.pair_limit != null) {
      throw new Error('pair_offset and pair_limit are only valid when output_mode=summary');
    }
    return { outputMode, pairKeys, pairOffset: null, pairLimit: null };
  }
  if (pairKeys.length) {
    throw new Error('pair_keys is only valid when output_mode=pair_detail');
  }
  return {
    outputMode,
    pairKeys,
    pairOffset: parseOffset(input.pair_offset),
    pairLimit: parseLimit(input.pair_limit),
  };
}
