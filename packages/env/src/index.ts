import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
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

export const env = z
  .object({
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgresql://postgres:postgres@127.0.0.1:5432/zama'),
    RPC_URL: z.string().default('http://127.0.0.1:8545'),
    CHAIN_ID: z.coerce.number().int().positive().default(31337),
    CONTRACT_ADDRESS: z.string().optional(),
    INDEXER_PRIVATE_KEY: privateKey.optional(),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    TOKEN_DECIMALS: z.coerce.number().int().nonnegative().default(6),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
    WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(50),
    DECRYPT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  })
  .parse(process.env);

export type Env = typeof env;
