import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { type Address, isAddress } from 'viem';
import { z } from 'zod';

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
});

const privateKey = z
  .string()
  .regex(
    /^0x[a-fA-F0-9]{64}$/,
    'INDEXER_PRIVATE_KEY must be a 32-byte hex key',
  );

const address = z.custom<Address>(
  (value) => typeof value === 'string' && isAddress(value),
  'must be a valid Ethereum address',
);

/** ERC-7984 wrapper + underlying ERC-20 both use 18 decimals in this project. */
export const TOKEN_DECIMALS = 18;

export const env = z
  .object({
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgresql://postgres:postgres@127.0.0.1:5432/zama'),
    RPC_URL: z.string().default('http://127.0.0.1:8545'),
    CHAIN_ID: z.coerce.number().int().positive().default(31337),
    CONTRACT_ADDRESS: address.optional(),
    UNDERLYING_ADDRESS: address.optional(),
    INDEXER_PRIVATE_KEY: privateKey.optional(),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
    WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(50),
    DECRYPT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  })
  .parse(process.env);

export type Env = typeof env;
