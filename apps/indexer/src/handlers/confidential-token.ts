import {
  getIndexerState,
  type InsertTransfer,
  insertTransfer,
  touchIndexerProgress,
  upsertIndexerState,
} from '@zama-indexer/db';
import { indexer } from 'envio';
import { resolveKind, toHandle } from './helpers';

const CHAIN_ID = 31337;

type IndexedEvent = {
  transaction: { hash: string };
  logIndex: number;
  block: { number: number; timestamp: number };
  srcAddress: string;
};

async function recordProgress(blockNumber: bigint, contractAddress: string) {
  const existing = await getIndexerState();

  if (!existing) {
    await upsertIndexerState({
      chainId: CHAIN_ID,
      contractAddress,
      indexedBlock: blockNumber,
      latestChainBlock: blockNumber,
      pendingDecryptionCount: 0,
      lastError: null,
    });

    return;
  }

  await touchIndexerProgress({
    indexedBlock: blockNumber,
    latestChainBlock: blockNumber,
  });
}

async function persistTransfer(
  event: IndexedEvent,
  fields: Omit<
    InsertTransfer,
    | 'id'
    | 'txHash'
    | 'logIndex'
    | 'blockNumber'
    | 'blockTimestamp'
    | 'contractAddress'
    | 'chainId'
  >,
) {
  const contractAddress = event.srcAddress;
  const blockNumber = BigInt(event.block.number);

  await insertTransfer({
    id: `${event.transaction.hash}-${event.logIndex}`,
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    blockNumber,
    blockTimestamp: new Date(Number(event.block.timestamp) * 1000),
    contractAddress,
    chainId: CHAIN_ID,
    ...fields,
  });

  await recordProgress(blockNumber, contractAddress);
}

indexer.onEvent(
  { contract: 'ConfidentialToken', event: 'ConfidentialTransfer' },
  async ({ event }) => {
    const from = event.params.from;
    const to = event.params.to;

    await persistTransfer(event, {
      fromAddress: from,
      toAddress: to,
      amountHandle: toHandle(event.params.amount),
      amountStatus: 'pending_decryption',
      kind: resolveKind(from, to),
    });
  },
);

indexer.onEvent(
  { contract: 'ConfidentialToken', event: 'UnwrapRequested' },
  async ({ event }) => {
    await persistTransfer(event, {
      fromAddress: event.srcAddress,
      toAddress: event.params.receiver,
      amountHandle: toHandle(event.params.amount),
      amountStatus: 'pending_decryption',
      kind: 'unwrap_request',
    });
  },
);

indexer.onEvent(
  { contract: 'ConfidentialToken', event: 'UnwrapFinalized' },
  async ({ event }) => {
    await persistTransfer(event, {
      fromAddress: event.srcAddress,
      toAddress: event.params.receiver,
      amountHandle: toHandle(event.params.encryptedAmount),
      amountStatus: 'decrypted',
      amountCleartext: String(event.params.cleartextAmount),
      kind: 'unwrap_finalize',
    });
  },
);
