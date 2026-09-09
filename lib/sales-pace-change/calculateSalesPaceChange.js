import {
  commercialDateForDay,
  commercialDayForDate,
  commercialMonthForDate,
} from '../ventas/commercialMonth.js';

export const MOVEMENTS = Object.freeze(['ACCELERATING', 'DECELERATING', 'STABLE', 'NOT_EVALUABLE']);
export const DIRECTIONS = Object.freeze(['POSITIVE', 'NEGATIVE', 'ZERO', 'NONE']);

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function stats(values) {
  if (!values.length) return { count: 0, median: null, p25: null, p75: null, min: null, max: null };
  return {
    count: values.length,
    median: median(values),
    p25: percentile(values, 0.25),
    p75: percentile(values, 0.75),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function direction(value) {
  if (value > 0) return 'POSITIVE';
  if (value < 0) return 'NEGATIVE';
  return 'ZERO';
}

export function candidateWindows(day) {
  const maxWindow = Math.floor(Number(day) / 2);
  const result = [];
  for (let w = 3; w <= maxWindow; w += 1) result.push(w);
  return result;
}

function rowsByDay(rows, targetMonth, cutoffDay) {
  const map = new Map();
  for (const row of rows || []) {
    if (row.target_month !== targetMonth) continue;
    const day = Number(row.day_of_month);
    if (!Number.isInteger(day) || day < 1 || day > cutoffDay) continue;
    map.set(day, Number(row.accumulated_sales));
  }
  return map;
}

function dailyValue(dayMap, day) {
  if (day === 1) {
    if (!dayMap.has(1)) return null;
    return dayMap.get(1);
  }
  if (!dayMap.has(day) || !dayMap.has(day - 1)) return null;
  return dayMap.get(day) - dayMap.get(day - 1);
}

function valuesForWindow(dayMap, cutoffDay, windowDays) {
  const firstDay = cutoffDay - (2 * windowDays) + 1;
  const previous = [];
  const recent = [];
  for (let day = firstDay; day <= cutoffDay; day += 1) {
    const value = dailyValue(dayMap, day);
    if (value == null || !Number.isFinite(value)) return null;
    if (day <= cutoffDay - windowDays) previous.push(value);
    else recent.push(value);
  }
  return { previous, recent };
}

function evaluateScale(dayMap, cutoffDay, windowDays) {
  const values = valuesForWindow(dayMap, cutoffDay, windowDays);
  if (!values) return null;
  const previousPace = median(values.previous);
  const recentPace = median(values.recent);
  const paceChange = recentPace - previousPace;
  const baseDirection = direction(paceChange);
  let stable = true;

  const combined = [
    ...values.previous.map((value) => ({ segment: 'previous', value })),
    ...values.recent.map((value) => ({ segment: 'recent', value })),
  ];
  for (let omitted = 0; omitted < combined.length; omitted += 1) {
    const previous = [];
    const recent = [];
    for (let index = 0; index < combined.length; index += 1) {
      if (index === omitted) continue;
      const item = combined[index];
      (item.segment === 'previous' ? previous : recent).push(item.value);
    }
    const looChange = median(recent) - median(previous);
    if (direction(looChange) !== baseDirection) {
      stable = false;
      break;
    }
  }

  return {
    window_days: windowDays,
    recent_pace: recentPace,
    previous_pace: previousPace,
    pace_change: paceChange,
    direction: baseDirection,
    robust: stable,
    leave_one_day_out_direction_stable: stable,
  };
}

export function classifyScaleEvidence(candidates, evidence) {
  const evaluated = evidence.filter(Boolean);
  const robust = evaluated.filter((item) => item.robust);

  if (candidates.length < 2) {
    return { movement: 'NOT_EVALUABLE', consensus_direction: 'NONE', candidates, evaluated, robust, evidence: evaluated, reason: 'INSUFFICIENT_CANDIDATE_WINDOWS' };
  }
  if (evaluated.length !== candidates.length) {
    return { movement: 'NOT_EVALUABLE', consensus_direction: 'NONE', candidates, evaluated, robust, evidence: evaluated, reason: 'INCOMPLETE_WINDOW_EVIDENCE' };
  }
  if (robust.length !== evaluated.length) {
    return { movement: 'NOT_EVALUABLE', consensus_direction: 'NONE', candidates, evaluated, robust, evidence: evaluated, reason: 'NON_ROBUST_WINDOW' };
  }
  const signs = new Set(robust.map((item) => item.direction));
  if (signs.size !== 1) {
    return { movement: 'NOT_EVALUABLE', consensus_direction: 'NONE', candidates, evaluated, robust, evidence: evaluated, reason: 'MULTISCALE_SIGN_DISAGREEMENT' };
  }
  const consensus = robust[0].direction;
  return {
    movement: consensus === 'POSITIVE' ? 'ACCELERATING' : consensus === 'NEGATIVE' ? 'DECELERATING' : 'STABLE',
    consensus_direction: consensus,
    candidates,
    evaluated,
    robust,
    evidence: evaluated,
    reason: null,
  };
}

function classifyAtDay(dayMap, day) {
  const candidates = candidateWindows(day);
  const evidence = candidates.map((w) => evaluateScale(dayMap, day, w));
  return classifyScaleEvidence(candidates, evidence);
}

function selectRows(history, grain, storeId) {
  if (grain === 'COMPANY') return history.cidef_daily || [];
  return (history.store_daily || []).filter((row) => String(row.sucursal_id) === String(storeId));
}

function historicalEquivalentContext(rows, currentMonth, commercialDay, windows) {
  const months = [...new Set(rows.map((row) => row.target_month).filter((month) => month < currentMonth))].sort();
  return {
    commercial_day: commercialDay,
    by_window: windows.map((windowDays) => {
      const samples = [];
      for (const month of months) {
        const map = rowsByDay(rows, month, commercialDay);
        const scale = evaluateScale(map, commercialDay, windowDays);
        if (scale) samples.push({ month, ...scale });
      }
      return {
        window_days: windowDays,
        historical_months: samples.map((sample) => sample.month),
        recent_pace: stats(samples.map((sample) => sample.recent_pace)),
        previous_pace: stats(samples.map((sample) => sample.previous_pace)),
        pace_change: stats(samples.map((sample) => sample.pace_change)),
      };
    }),
  };
}

function persistenceForDay(dayMap, targetMonth, currentDay) {
  const current = classifyAtDay(dayMap, currentDay);
  const previous = currentDay > 1 ? classifyAtDay(dayMap, currentDay - 1) : null;
  const previousMovement = previous?.movement ?? null;

  if (current.movement === 'NOT_EVALUABLE') {
    return {
      previous_movement: previousMovement,
      onset_cutoff_date: null,
      persistence_days: 0,
      continuity_break: previousMovement !== null,
      continuity_break_reason: previousMovement !== null ? 'NON_EVALUABLE_GAP' : null,
    };
  }

  let persistenceDays = 1;
  let onsetDay = currentDay;
  for (let day = currentDay - 1; day >= 1; day -= 1) {
    const prior = classifyAtDay(dayMap, day);
    if (prior.movement !== current.movement || prior.movement === 'NOT_EVALUABLE') break;
    persistenceDays += 1;
    onsetDay = day;
  }

  let breakReason = null;
  if (previousMovement === 'NOT_EVALUABLE') breakReason = 'NON_EVALUABLE_GAP';
  else if (previousMovement != null && previousMovement !== current.movement) breakReason = 'MOVEMENT_CHANGE';

  return {
    previous_movement: previousMovement,
    onset_cutoff_date: commercialDateForDay(targetMonth, onsetDay),
    persistence_days: persistenceDays,
    continuity_break: breakReason !== null,
    continuity_break_reason: breakReason,
  };
}

export function calculateSalesPaceChange(history, input, nowDate) {
  const allowed = new Set(['cutoff_date', 'grain', 'store_id']);
  const unsupported = Object.keys(input || {}).filter((key) => !allowed.has(key));
  if (unsupported.length) throw new Error(`Unsupported input(s) for sales_pace_change_v01: ${unsupported.join(', ')}`);

  const cutoffDate = String(input?.cutoff_date || '');
  const grain = String(input?.grain || '').trim().toUpperCase();
  if (!['COMPANY', 'STORE'].includes(grain)) throw new Error('grain must be COMPANY or STORE');
  if (grain === 'STORE' && (input?.store_id == null || String(input.store_id).trim() === '')) throw new Error('store_id is required when grain=STORE');
  if (grain === 'COMPANY' && input?.store_id != null) throw new Error('store_id is only supported when grain=STORE');

  const observableDate = String(nowDate || cutoffDate);
  const currentCommercialMonth = commercialMonthForDate(observableDate);
  const targetMonth = commercialMonthForDate(cutoffDate);
  if (targetMonth !== currentCommercialMonth) throw new Error('cutoff_date must belong to the current commercial month');
  if (cutoffDate > observableDate) throw new Error('cutoff_date cannot be in the future');

  const commercialDay = commercialDayForDate(cutoffDate);
  const rows = selectRows(history, grain, input?.store_id).filter((row) => row.cutoff_date <= cutoffDate);
  const dayMap = rowsByDay(rows, targetMonth, commercialDay);
  const classification = classifyAtDay(dayMap, commercialDay);
  const warnings = [];
  if (classification.reason) warnings.push(classification.reason);
  if (grain === 'STORE' && classification.reason === 'INCOMPLETE_WINDOW_EVIDENCE') warnings.push('STORE_SPARSE_EVIDENCE');

  return {
    engine: 'sales_pace_change_v01',
    version: '0.1',
    domain: 'VENTAS',
    capability: 'PACE_CHANGE',
    commercial_scope: { universe: 'OWN_STORES' },
    grain,
    store_id: grain === 'STORE' ? input.store_id : null,
    cutoff_date: cutoffDate,
    target_month: targetMonth,
    commercial_day: commercialDay,
    movement: classification.movement,
    evaluable: classification.movement !== 'NOT_EVALUABLE',
    candidate_windows: classification.candidates,
    evaluated_windows: classification.evaluated.map((item) => item.window_days),
    robust_windows: classification.robust.map((item) => item.window_days),
    consensus_direction: classification.consensus_direction,
    scale_evidence: classification.evidence,
    historical_equivalent_context: historicalEquivalentContext(rows, targetMonth, commercialDay, classification.candidates),
    persistence: persistenceForDay(dayMap, targetMonth, commercialDay),
    coverage: {
      certified_source_engine: history.engine ?? 'intramonth_sales_history_context_v01',
      certified_source_version: history.version ?? '0.1',
      source_status: history.status ?? null,
      current_month_rows_available: [...dayMap.keys()].length,
      current_month_days_through_cutoff: commercialDay,
      candidate_window_count: classification.candidates.length,
      evaluated_window_count: classification.evaluated.length,
      robust_window_count: classification.robust.length,
      store_zero_semantics: grain === 'STORE' ? 'SPARSE_POSITIVE; absent store row is not zero' : 'NOT_APPLICABLE',
    },
    temporal_semantics: {
      commercial_month: 'calendar day 2 through calendar day 1 of next month, inclusive',
      cutoff_safe: true,
      future_evidence_used: false,
      pace_unit: 'VIN_PER_COMMERCIAL_DAY',
    },
    stable_semantics: 'STABLE means only deterministic absence of change in observed pace between compared segments; it does not imply good performance, sufficient pace, commercial health, target attainment, favorable forecast, or absence of risk.',
    warnings,
  };
}
