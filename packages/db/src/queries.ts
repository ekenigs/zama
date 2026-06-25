import { env } from '@zama-indexer/env';
import { and, count, desc, eq, or, sql } from 'drizzle-orm';
import { db } from './client';
import type { InsertTransfer } from './schema';
import { balances, decryptAttempts, indexerState, transfers } from './schema';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export async function insertTransfer(row: InsertTransfer) {
  await db
    .insert(transfers)
    .values({
      ...row,
      fromAddress: normalizeAddress(row.fromAddress),
      toAddress: normalizeAddress(row.toAddress),
      contractAddress: normalizeAddress(row.contractAddress),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function countPendingDecryptions() {
  const [row] = await db
    .select({ value: count() })
    .from(transfers)
    .where(eq(transfers.amountStatus, 'pending_decryption'));

  return Number(row?.value ?? 0);
}

export async function fetchPendingTransfers(limit: number) {
  return db
    .select()
    .from(transfers)
    .where(eq(transfers.amountStatus, 'pending_decryption'))
    .orderBy(transfers.blockNumber, transfers.logIndex)
    .limit(limit);
}

export async function markTransferDecrypted(
  transferId: string,
  cleartext: string,
) {
  await db
    .update(transfers)
    .set({
      amountStatus: 'decrypted',
      amountCleartext: cleartext,
      updatedAt: new Date(),
    })
    .where(eq(transfers.id, transferId));
}

export async function logDecryptAttempt(input: {
  id: string;
  transferId: string;
  attemptNum: number;
  outcome: string;
  errorMessage?: string;
}) {
  const now = new Date();

  await db.insert(decryptAttempts).values({
    id: input.id,
    transferId: input.transferId,
    attemptNum: input.attemptNum,
    outcome: input.outcome,
    errorMessage: input.errorMessage ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function countDecryptAttempts(transferId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(decryptAttempts)
    .where(eq(decryptAttempts.transferId, transferId));

  return Number(row?.value ?? 0);
}

export async function upsertBalance(input: {
  address: string;
  contractAddress: string;
  balanceCleartext: string | null;
  balanceStatus: string;
  blockNumber: bigint | null;
}) {
  const now = new Date();
  const address = normalizeAddress(input.address);
  const contractAddress = normalizeAddress(input.contractAddress);

  await db
    .insert(balances)
    .values({
      address,
      contractAddress,
      balanceCleartext: input.balanceCleartext,
      balanceStatus: input.balanceStatus,
      blockNumber: input.blockNumber,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [balances.address, balances.contractAddress],
      set: {
        balanceCleartext: input.balanceCleartext,
        balanceStatus: input.balanceStatus,
        blockNumber: input.blockNumber,
        updatedAt: now,
      },
    });
}

export async function getBalance(address: string, contractAddress: string) {
  return db.query.balances.findFirst({
    where: and(
      eq(balances.address, normalizeAddress(address)),
      eq(balances.contractAddress, normalizeAddress(contractAddress)),
    ),
  });
}

export async function getTransfersForAddress(input: {
  address: string;
  contractAddress: string;
  limit: number;
  cursorBlock?: bigint;
  cursorLogIndex?: number;
  direction: 'in' | 'out' | 'all';
}) {
  const address = normalizeAddress(input.address);
  const contract = normalizeAddress(input.contractAddress);
  const conditions = buildTransferConditions({
    address,
    contract,
    direction: input.direction,
    cursorBlock: input.cursorBlock,
    cursorLogIndex: input.cursorLogIndex,
  });

  return db
    .select()
    .from(transfers)
    .where(and(...conditions))
    .orderBy(desc(transfers.blockNumber), desc(transfers.logIndex))
    .limit(input.limit);
}

export async function getIndexerState() {
  return db.query.indexerState.findFirst({
    where: eq(indexerState.id, 'default'),
  });
}

export async function upsertIndexerState(input: {
  chainId: number;
  contractAddress: string;
  indexedBlock: bigint;
  latestChainBlock: bigint;
  pendingDecryptionCount: number;
  lastError?: string | null;
}) {
  const now = new Date();

  await db
    .insert(indexerState)
    .values({
      id: 'default',
      chainId: input.chainId,
      contractAddress: normalizeAddress(input.contractAddress),
      indexedBlock: input.indexedBlock,
      latestChainBlock: input.latestChainBlock,
      pendingDecryptionCount: input.pendingDecryptionCount,
      lastError: input.lastError ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: indexerState.id,
      set: {
        indexedBlock: input.indexedBlock,
        latestChainBlock: input.latestChainBlock,
        pendingDecryptionCount: input.pendingDecryptionCount,
        lastError: input.lastError ?? null,
        updatedAt: now,
      },
    });
}

export async function touchIndexerProgress(input: {
  indexedBlock: bigint;
  latestChainBlock: bigint;
}) {
  const pending = await countPendingDecryptions();
  const defaults = await resolveIndexerDefaults();

  await upsertIndexerState({
    ...defaults,
    indexedBlock: input.indexedBlock,
    latestChainBlock: input.latestChainBlock,
    pendingDecryptionCount: pending,
    lastError: null,
  });
}

export async function refreshPendingDecryptionCount() {
  const pending = await countPendingDecryptions();
  const existing = await getIndexerState();

  if (!existing) {
    return;
  }

  await upsertIndexerState({
    chainId: existing.chainId,
    contractAddress: existing.contractAddress,
    indexedBlock: existing.indexedBlock,
    latestChainBlock: existing.latestChainBlock,
    pendingDecryptionCount: pending,
    lastError: existing.lastError,
  });
}

async function resolveIndexerDefaults() {
  const existing = await getIndexerState();

  return {
    chainId: existing?.chainId ?? env.CHAIN_ID,
    contractAddress:
      existing?.contractAddress ?? env.CONTRACT_ADDRESS ?? ZERO_ADDRESS,
  };
}

function buildTransferConditions(input: {
  address: string;
  contract: string;
  direction: 'in' | 'out' | 'all';
  cursorBlock?: bigint;
  cursorLogIndex?: number;
}) {
  const conditions = [eq(transfers.contractAddress, input.contract)];

  if (input.direction === 'in') {
    conditions.push(eq(transfers.toAddress, input.address));
  } else if (input.direction === 'out') {
    conditions.push(eq(transfers.fromAddress, input.address));
  } else {
    const addressFilter = or(
      eq(transfers.fromAddress, input.address),
      eq(transfers.toAddress, input.address),
    );

    if (addressFilter) {
      conditions.push(addressFilter);
    }
  }

  if (input.cursorBlock !== undefined && input.cursorLogIndex !== undefined) {
    conditions.push(
      sql`(${transfers.blockNumber}, ${transfers.logIndex}) < (${input.cursorBlock}, ${input.cursorLogIndex})`,
    );
  }

  conditions.push(sql`${transfers.fromAddress} != ${ZERO_ADDRESS}`);
  conditions.push(sql`${transfers.toAddress} != ${ZERO_ADDRESS}`);

  return conditions;
}
