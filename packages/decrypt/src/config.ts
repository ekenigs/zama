import { env } from '@zama-indexer/env';
import { createSdk } from './sdk';

if (!env.INDEXER_PRIVATE_KEY) {
  throw new Error('INDEXER_PRIVATE_KEY is required');
}

if (!env.CONTRACT_ADDRESS) {
  throw new Error('CONTRACT_ADDRESS is required');
}

export const indexerPrivateKey = env.INDEXER_PRIVATE_KEY as `0x${string}`;
export const contractAddress = env.CONTRACT_ADDRESS;
export const sdk = createSdk(indexerPrivateKey);
