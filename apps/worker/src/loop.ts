import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import {
  countDecryptAttempts,
  fetchPendingTransfers,
  logDecryptAttempt,
  markTransferDecrypted,
  refreshPendingDecryptionCount,
  type TransferRow,
} from '@zama-indexer/db';
import {
  type DecryptOutcome,
  refreshBalances,
  tryDecryptTransfer,
} from '@zama-indexer/decrypt';
import { env } from '@zama-indexer/env';

async function logOutcome(row: TransferRow, outcome: DecryptOutcome) {
  const attemptNum = (await countDecryptAttempts(row.id)) + 1;

  if (outcome.ok) {
    await markTransferDecrypted(row.id, outcome.cleartext);
    await refreshBalances(row.fromAddress, row.toAddress, row.blockNumber);
    await logDecryptAttempt({
      id: randomUUID(),
      transferId: row.id,
      attemptNum,
      outcome: 'success',
    });

    return;
  }

  await logDecryptAttempt({
    id: randomUUID(),
    transferId: row.id,
    attemptNum,
    outcome: outcome.reason,
  });
}

async function processPendingBatch(batchSize: number, timeoutMs: number) {
  const pending = await fetchPendingTransfers(batchSize);

  for (const row of pending) {
    const outcome = await tryDecryptTransfer(row, timeoutMs);

    await logOutcome(row, outcome);
  }
}

export async function runDecryptLoop(signal: AbortSignal) {
  const {
    WORKER_POLL_INTERVAL_MS: pollInterval,
    WORKER_BATCH_SIZE: batchSize,
    DECRYPT_TIMEOUT_MS: timeoutMs,
  } = env;

  while (!signal.aborted) {
    await processPendingBatch(batchSize, timeoutMs);
    await refreshPendingDecryptionCount();

    try {
      await setTimeout(pollInterval, undefined, { signal });
    } catch {
      break;
    }
  }
}
