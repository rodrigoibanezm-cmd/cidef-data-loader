import { executeAndAdmitEvidence, createEvidenceLedgerValue, createEvidenceRecordV2, createTypedClaim } from '../../lib/protocol/execution/index.js';
import { createProtocolState } from '../../lib/protocol/runtime/index.js';
import { clone } from '../../lib/protocol/primitives.js';
import { authorizedFocused, executeCommand, motorFor } from './execution-helpers.js';

export const SUFFICIENCY_CLOCK='2026-09-15T12:04:00.000Z';
export const GOAL_CLOCK='2026-09-15T12:05:00.000Z';
export const CLOSURE_CLOCK='2026-09-15T12:06:00.000Z';
export const SYNTHESIS_CLOCK='2026-09-15T12:07:00.000Z';

export async function admittedFocused(){const f=await authorizedFocused(),motor=motorFor(),out=await executeAndAdmitEvidence(f.state,f.authorization,executeCommand(f.state,f.authorization),{applicabilityDecisions:f.applicabilityDecisions,availabilitySnapshot:f.availability,motorResolver:motor.resolver,clock:'2026-09-15T12:03:00.000Z'});return {...f,motor,out,state:out.state,ledger:out.ledger,goal:out.state.goals[0]};}
export function rebuildEvidence(record,mutate){const draft=clone(record);delete draft.evidence_fingerprint;mutate(draft);return createEvidenceRecordV2(draft);}
export function rebuildClaim(claim,mutate){const draft=clone(claim);delete draft.claim_fingerprint;mutate(draft);return createTypedClaim(draft);}
export function contextWithRecords(f,records){const ledger=createEvidenceLedgerValue({...clone(f.ledger),records,ledger_version:records.length,ledger_hash:undefined});const state=createProtocolState({...clone(f.state),admitted_evidence_refs:records.map(item=>item.evidence_fingerprint),state_hash:undefined});return {...f,ledger,state,goal:state.goals[0]};}
