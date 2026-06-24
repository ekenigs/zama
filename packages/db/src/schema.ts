import { relations } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

function createdUpdatedColumns() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  };
}

export const transfers = pgTable(
  'transfers',
  {
    id: text('id').primaryKey(),
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
    blockTimestamp: timestamp('block_timestamp', { withTimezone: true }),
    kind: text('kind').notNull(),
    fromAddress: text('from_address').notNull(),
    toAddress: text('to_address').notNull(),
    amountHandle: text('amount_handle').notNull(),
    amountStatus: text('amount_status').notNull(),
    amountCleartext: text('amount_cleartext'),
    contractAddress: text('contract_address').notNull(),
    chainId: integer('chain_id').notNull(),
    ...createdUpdatedColumns(),
  },
  (table) => [
    index('transfers_from_block_idx').on(
      table.fromAddress,
      table.blockNumber,
      table.logIndex,
    ),
    index('transfers_to_block_idx').on(
      table.toAddress,
      table.blockNumber,
      table.logIndex,
    ),
    index('transfers_amount_status_idx').on(table.amountStatus),
  ],
);

export const balances = pgTable(
  'balances',
  {
    address: text('address').notNull(),
    contractAddress: text('contract_address').notNull(),
    balanceCleartext: text('balance_cleartext'),
    balanceStatus: text('balance_status').notNull(),
    blockNumber: bigint('block_number', { mode: 'bigint' }),
    ...createdUpdatedColumns(),
  },
  (table) => [primaryKey({ columns: [table.address, table.contractAddress] })],
);

export const indexerState = pgTable('indexer_state', {
  id: text('id').primaryKey(),
  chainId: integer('chain_id').notNull(),
  contractAddress: text('contract_address').notNull(),
  indexedBlock: bigint('indexed_block', { mode: 'bigint' }).notNull(),
  latestChainBlock: bigint('latest_chain_block', { mode: 'bigint' }).notNull(),
  pendingDecryptionCount: integer('pending_decryption_count')
    .notNull()
    .default(0),
  lastError: text('last_error'),
  ...createdUpdatedColumns(),
});

export const decryptAttempts = pgTable(
  'decrypt_attempts',
  {
    id: text('id').primaryKey(),
    transferId: text('transfer_id')
      .notNull()
      .references(() => transfers.id),
    attemptNum: integer('attempt_num').notNull(),
    outcome: text('outcome').notNull(),
    errorMessage: text('error_message'),
    ...createdUpdatedColumns(),
  },
  (table) => [index('decrypt_attempts_transfer_idx').on(table.transferId)],
);

export const decryptAttemptsRelations = relations(
  decryptAttempts,
  ({ one }) => ({
    transfer: one(transfers, {
      fields: [decryptAttempts.transferId],
      references: [transfers.id],
    }),
  }),
);

export type TransferRow = typeof transfers.$inferSelect;
export type InsertTransfer = typeof transfers.$inferInsert;
