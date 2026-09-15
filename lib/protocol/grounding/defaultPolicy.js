import { deepFreeze, invariant, rejectUnknown, requireEnum, requireObject, requireString } from '../primitives.js';

const POLICY_DRAFT = {
  contract_version: 'default_policy.v1',
  policy_id: 'grounding.defaults.cidef.v1',
  defaults: {
    timezone: { value: 'America/Santiago', precondition: 'TEMPORAL_MATERIALIZATION_REQUESTED' },
    current_date_anchor: { source: 'FROZEN_BACKEND_CLOCK', precondition: 'RELATIVE_TEMPORAL_EXPRESSION' },
    calendar_alignment: { value: 'CALENDAR', precondition: 'CALENDAR_UNIT_WITHOUT_EXPLICIT_ALIGNMENT' },
  },
  forbidden_defaults: [
    'COMMERCIAL_UNIVERSE', 'ORGANIZATION_SCOPE', 'MARKET_UNIVERSE', 'PEER_SET',
    'COMPARISON_RELATION', 'CANONICAL_SUBJECT',
  ],
};

export function validateDefaultPolicy(value) {
  rejectUnknown(value,['contract_version','policy_id','defaults','forbidden_defaults'],'$'); requireEnum(value.contract_version,['default_policy.v1'],'$.contract_version'); requireString(value.policy_id,'$.policy_id'); requireObject(value.defaults,'$.defaults');
  rejectUnknown(value.defaults,['timezone','current_date_anchor','calendar_alignment'],'$.defaults');
  rejectUnknown(value.defaults.timezone,['value','precondition'],'$.defaults.timezone'); requireString(value.defaults.timezone.value,'$.defaults.timezone.value'); requireString(value.defaults.timezone.precondition,'$.defaults.timezone.precondition');
  rejectUnknown(value.defaults.current_date_anchor,['source','precondition'],'$.defaults.current_date_anchor'); requireEnum(value.defaults.current_date_anchor.source,['FROZEN_BACKEND_CLOCK'],'$.defaults.current_date_anchor.source'); requireString(value.defaults.current_date_anchor.precondition,'$.defaults.current_date_anchor.precondition');
  rejectUnknown(value.defaults.calendar_alignment,['value','precondition'],'$.defaults.calendar_alignment'); requireEnum(value.defaults.calendar_alignment.value,['CALENDAR'],'$.defaults.calendar_alignment.value'); requireString(value.defaults.calendar_alignment.precondition,'$.defaults.calendar_alignment.precondition');
  invariant(Array.isArray(value.forbidden_defaults)&&value.forbidden_defaults.length>0,'INVALID_FORBIDDEN_DEFAULTS','$.forbidden_defaults'); return true;
}
validateDefaultPolicy(POLICY_DRAFT);
export const TARGET_DEFAULT_POLICY = deepFreeze(POLICY_DRAFT);

export function resolveGroundingDefaults({ now, timezone } = {}) {
  const frozen = now instanceof Date ? now : new Date(now);
  invariant(Number.isFinite(frozen.getTime()), 'FROZEN_CLOCK_REQUIRED', '$.now');
  const effectiveTimezone = timezone ?? TARGET_DEFAULT_POLICY.defaults.timezone.value;
  invariant(effectiveTimezone === 'America/Santiago', 'UNREGISTERED_TIMEZONE_DEFAULT', '$.timezone');
  return deepFreeze({
    timezone: effectiveTimezone,
    anchor_timestamp: frozen.toISOString(),
    alignment: TARGET_DEFAULT_POLICY.defaults.calendar_alignment.value,
    policy_refs: [TARGET_DEFAULT_POLICY.policy_id],
  });
}
