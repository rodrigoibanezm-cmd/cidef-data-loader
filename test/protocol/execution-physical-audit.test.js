import test from 'node:test';import assert from 'node:assert/strict';
import { run as ventasLongitudinalMotor } from '../../lib/motors/ventas-longitudinal-context-v01.js';
import { getCapabilityContract } from '../../lib/protocol/planning/index.js';

test('target executor reference names the actual read-only LONGITUDINAL/VENTAS motor',()=>{const capability=getCapabilityContract('LONGITUDINAL/VENTAS');assert.equal(capability.physical.motor_ref,'ventas_longitudinal_context_v01');assert.equal(typeof ventasLongitudinalMotor,'function');assert.equal(capability.physical.input_contract_ref,'parseVentasLongitudinalInput.v0.3');assert.equal(capability.evidence.evidence_projector_ref,'protocol.evidence.observed_value.v1');});
