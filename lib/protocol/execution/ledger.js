import { clone, invariant } from '../primitives.js';
import { createEvidenceLedgerValue, validateEvidenceAdmissionDecision, validateEvidenceLedger, validateEvidenceRecordV2 } from './contracts.js';

export function createEvidenceLedger(protocol_id) {
  return createEvidenceLedgerValue({ contract_version:'evidence_ledger.v1', protocol_id, ledger_version:0, records:[], previous_ledger_hash:'GENESIS' });
}
export function appendAdmittedEvidence(ledger, decision, record) {
  validateEvidenceLedger(ledger); validateEvidenceAdmissionDecision(decision); validateEvidenceRecordV2(record);
  invariant(decision.status === 'ADMITTED' && decision.evidence_fingerprint === record.evidence_fingerprint, 'EVIDENCE_NOT_ADMITTED', '$.decision');
  invariant(ledger.protocol_id === record.protocol_id, 'PROTOCOL_MISMATCH', '$.record.protocol_id');
  invariant(!ledger.records.some(item => item.evidence_fingerprint === record.evidence_fingerprint), 'DUPLICATE_EVIDENCE', '$.records');
  return createEvidenceLedgerValue({ contract_version:'evidence_ledger.v1', protocol_id:ledger.protocol_id, ledger_version:ledger.ledger_version+1, records:[...clone(ledger.records), record], previous_ledger_hash:ledger.ledger_hash });
}
