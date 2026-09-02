function common(context) {
  return {
    context: context.context,
    version: context.version,
    scope: context.scope,
    output: context.output,
    targets: context.targets,
    universes: context.universes,
    coverage: context.coverage,
  };
}

export function projectBacktestOutput(context) {
  if (context.output.outputMode === 'summary') {
    return {
      ...common(context),
      pairs: context.summaries,
      validation: context.validation,
      warnings: context.warnings,
    };
  }

  const requested = new Set(context.output.pairKeys);
  const pairs = context.summaries
    .filter((pair) => requested.has(pair.pairKey))
    .map((pair) => ({ ...pair, detail: context.detailByKey.get(pair.pairKey) }));
  return {
    ...common(context),
    pairs,
    validation: context.validation,
    warnings: context.warnings,
  };
}
