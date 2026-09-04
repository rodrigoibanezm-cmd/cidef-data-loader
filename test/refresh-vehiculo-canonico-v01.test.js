import test from 'node:test';
import assert from 'node:assert/strict';

import { validateRefreshAudit } from '../lib/canonical/refresh-vehiculo-canonico-v01.js';
import { getMotor } from '../lib/motors/index.js';

test('refresh vehiculo canonico motor is registered', () => {
  assert.equal(typeof getMotor('refresh_vehiculo_canonico_v01'), 'function');
});

test('preflight blocks duplicate valid VIN rows', () => {
  assert.throws(
    () => validateRefreshAudit({ duplicate_valid_rows: '1' }),
    /duplicate valid VIN rows=1/,
  );
});

test('unresolved commercial identity is allowed when structural integrity holds', () => {
  assert.equal(
    validateRefreshAudit(
      { duplicate_valid_rows: '0' },
      {
        valid_raw_vins: '47378',
        canonical_rows: '47378',
        invalid_persisted: '0',
        missing_from_canonical: '0',
        extra_in_canonical: '0',
        store_integrity_failed: '0',
        dealer_integrity_failed: '0',
        status_mismatch: '0',
        unresolved: '350',
      },
    ),
    true,
  );
});

test('post audit blocks canonical/raw mismatch', () => {
  assert.throws(
    () => validateRefreshAudit(
      { duplicate_valid_rows: '0' },
      {
        valid_raw_vins: '47378',
        canonical_rows: '47377',
        invalid_persisted: '0',
        missing_from_canonical: '1',
        extra_in_canonical: '0',
        store_integrity_failed: '0',
        dealer_integrity_failed: '0',
        status_mismatch: '0',
      },
    ),
    /integrity failed/,
  );
});

test('post audit blocks store/dealer structural corruption', () => {
  assert.throws(
    () => validateRefreshAudit(
      { duplicate_valid_rows: '0' },
      {
        valid_raw_vins: '47378',
        canonical_rows: '47378',
        invalid_persisted: '0',
        missing_from_canonical: '0',
        extra_in_canonical: '0',
        store_integrity_failed: '1',
        dealer_integrity_failed: '0',
        status_mismatch: '0',
      },
    ),
    /store_integrity_failed/,
  );
});
