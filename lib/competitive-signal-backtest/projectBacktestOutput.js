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

function compactSummary(pair) {
  return {
    pairKey: pair.pairKey,
    targetModelId: pair.target.modelId,
    peer: {
      entityKey: pair.peer.entityKey,
      modelId: pair.peer.modelId,
      identityStatus: pair.peer.identityStatus,
      brand: pair.peer.brand,
      model: pair.peer.model,
    },
    universeKey: pair.universe.universeKey,
    continuity: pair.continuity,
    shareGap: pair.shareGap,
    crossings: pair.crossings,
    convergenceDivergence: pair.convergenceDivergence,
    diagnostics: pair.diagnostics,
  };
}

function summaryOutput(context) {
  const ordered = [...context.summaries].sort((a, b) => a.pairKey.localeCompare(b.pairKey));
  const offset = context.output.pairOffset;
  const limit = context.output.pairLimit;
  const pairs = ordered.slice(offset, offset + limit).map(compactSummary);
  const nextOffset = offset + pairs.length;
  const hasMore = nextOffset < ordered.length;
  return {
    ...common(context),
    pairs,
    page: {
      pairOffset: offset,
      pairLimit: limit,
      totalPairs: ordered.length,
      returnedPairs: pairs.length,
      hasMore,
      nextOffset: hasMore ? nextOffset : null,
    },
    validation: {
      ...context.validation,
      summary_total_pairs: ordered.length,
      summary_pairs_returned: pairs.length,
    },
    warnings: context.warnings,
  };
}

function detailOutput(context) {
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

export function projectBacktestOutput(context) {
  return context.output.outputMode === 'summary'
    ? summaryOutput(context)
    : detailOutput(context);
}
