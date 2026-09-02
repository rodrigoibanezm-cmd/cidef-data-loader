const episodeKey = (row) => `${row.unit_id}|${row.onset_month}|${row.confirmation_month}`;
const episodeShape = (row) => ({
  unit_id: row.unit_id,
  unit_label: row.unit_label,
  onset_month: row.onset_month,
  confirmation_month: row.confirmation_month,
  next_reverted: row.next_reverted,
  next_2_all_negative: row.next_2_all_negative,
  next_3_all_negative: row.next_3_all_negative,
});

function persistentUnits(episodes) {
  const map = new Map();
  for (const row of episodes) map.set(String(row.unit_id), { unit_id: row.unit_id, unit_label: row.unit_label });
  return map;
}

export function compareSemantics(oldBacktest, oldEvaluation, newBacktest, newEvaluation) {
  const oldUnits = persistentUnits(oldEvaluation.episodes);
  const newUnits = persistentUnits(newEvaluation.episodes);
  const oldEpisodes = new Map(oldEvaluation.episodes.map((row) => [episodeKey(row), row]));
  const newEpisodes = new Map(newEvaluation.episodes.map((row) => [episodeKey(row), row]));

  const both = [...oldUnits.keys()].filter((key) => newUnits.has(key)).map((key) => oldUnits.get(key));
  const oldOnly = [...oldUnits.keys()].filter((key) => !newUnits.has(key)).map((key) => oldUnits.get(key));
  const newOnly = [...newUnits.keys()].filter((key) => !oldUnits.has(key)).map((key) => newUnits.get(key));

  return {
    old: {
      evaluable_rows: oldBacktest.rows.length,
      confirmed_episodes: oldEvaluation.episodes.length,
      persistent_units: oldUnits.size,
      persistent_unit_ids: [...oldUnits.keys()],
    },
    new: {
      evaluable_rows: newBacktest.rows.length,
      confirmed_episodes: newEvaluation.episodes.length,
      persistent_units: newUnits.size,
      persistent_unit_ids: [...newUnits.keys()],
    },
    comparison: { persistent_both: both, old_only: oldOnly, new_only: newOnly },
    old_only_episodes: [...oldEpisodes].filter(([key]) => !newEpisodes.has(key)).map(([, row]) => episodeShape(row)),
    new_only_episodes: [...newEpisodes].filter(([key]) => !oldEpisodes.has(key)).map(([, row]) => episodeShape(row)),
  };
}
