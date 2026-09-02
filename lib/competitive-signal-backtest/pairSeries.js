function transportUniverseKey(row, originGroup) {
  return `${row.universeKey}|${originGroup || 'ALL'}`;
}

function meta(row) {
  return {
    entityKey: row.entityKey,
    modelId: row.modelId,
    identityStatus: row.identityStatus,
    brand: row.brand,
    model: row.model,
  };
}

function groupMonthly(rows, originGroup) {
  const universes = new Map();
  for (const row of rows) {
    const key = transportUniverseKey(row, originGroup);
    if (!universes.has(key)) {
      universes.set(key, {
        key,
        universe: { ...row.universe, originGroup: originGroup || null },
        targetModelIds: [...row.targetModelIds],
        entities: new Map(),
      });
    }
    const universe = universes.get(key);
    if (!universe.entities.has(row.entityKey)) universe.entities.set(row.entityKey, []);
    universe.entities.get(row.entityKey).push(row);
  }
  return universes;
}

function pairMonths(targetRows, peerRows) {
  const peerByMonth = new Map(peerRows.map((row) => [row.month, row]));
  return [...targetRows]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((target) => ({ target, peer: peerByMonth.get(target.month) }))
    .filter((row) => row.peer);
}

export function buildPairSeries(context, originGroup = null) {
  const universes = groupMonthly(context.monthly, originGroup);
  const pairs = [];
  const missingTargetUniverses = [];
  let expectedPairCount = 0;

  for (const universe of universes.values()) {
    const entries = [...universe.entities.entries()];
    for (const targetModelId of universe.targetModelIds) {
      const targetEntry = entries.find(([, rows]) => rows[0]?.modelId === targetModelId);
      if (!targetEntry) {
        missingTargetUniverses.push(`${targetModelId}|${universe.key}`);
        continue;
      }
      expectedPairCount += Math.max(0, entries.length - 1);
      const [targetEntityKey, targetRows] = targetEntry;
      for (const [peerEntityKey, peerRows] of entries) {
        if (peerEntityKey === targetEntityKey) continue;
        const target = targetRows[0];
        const peer = peerRows[0];
        pairs.push({
          pairKey: `${targetModelId}|${peerEntityKey}|${universe.key}`,
          target: meta(target),
          peer: meta(peer),
          universeKey: universe.key,
          universe: universe.universe,
          months: pairMonths(targetRows, peerRows),
        });
      }
    }
  }
  return { pairs, expectedPairCount, missingTargetUniverses, universeCount: universes.size };
}
