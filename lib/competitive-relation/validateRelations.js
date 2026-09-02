import { evaluateCompetitiveRelation } from './rule.js';

function unique(values) {
  return new Set(values).size === values.length;
}

export function validateRelations({ context, projection }) {
  const allSelected = context.summaries.filter((summary) => evaluateCompetitiveRelation(summary).selected);
  const selectedKeys = allSelected.map((summary) => summary.pairKey);
  const validation = {
    source_signal_backtest_ok: context.validation.ok,
    source_monthly_share_reconciles: context.validation.monthly_share_reconciles,
    relation_count_reconciles: projection.selectedTotal === allSelected.length,
    selected_pair_keys_unique: unique(selectedKeys),
    selected_pairs_satisfy_rule: allSelected.every((summary) => evaluateCompetitiveRelation(summary).selected),
    no_self_relations: allSelected.every((summary) => summary.target.entityKey !== summary.peer.entityKey),
  };
  validation.ok = Object.values(validation).every((value) => value === true);
  return validation;
}
