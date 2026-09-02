function common(context, request) {
  return {
    context: context.context,
    version: context.version,
    scope: context.scope,
    targets: context.targets,
    peerUniverses: context.peerUniverses,
    output: {
      mode: request.outputMode,
      entityKeys: request.entityKeys,
    },
  };
}

function trajectoryOutput(context, request) {
  return {
    ...common(context, request),
    trajectory: context.trajectory,
    validation: context.validation,
    warnings: context.warnings,
  };
}

function monthlyOutput(context, request) {
  const requested = new Set(request.entityKeys);
  const monthly = context.monthly.filter((row) => requested.has(row.entityKey));
  const matched = [...new Set(monthly.map((row) => row.entityKey))].sort();
  const missing = request.entityKeys.filter((key) => !matched.includes(key));
  const warnings = [...context.warnings];
  if (missing.length) warnings.push('REQUESTED_ENTITY_KEY_NOT_FOUND');
  const validation = {
    ...context.validation,
    requested_entity_keys: request.entityKeys.length,
    matched_entity_keys: matched.length,
    monthly_rows_returned: monthly.length,
    entity_keys_complete: missing.length === 0,
  };
  validation.ok = context.validation.ok && validation.entity_keys_complete;
  return {
    ...common(context, request),
    monthly,
    validation,
    warnings: [...new Set(warnings)],
  };
}

export function projectTrajectoryOutput(context, request) {
  return request.outputMode === 'monthly'
    ? monthlyOutput(context, request)
    : trajectoryOutput(context, request);
}
