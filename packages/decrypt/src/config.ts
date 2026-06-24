import { cleartext, memoryStorage, ZamaSDK } from '@zama-fhe/sdk';
import { anvil, type FheChain } from '@zama-fhe/sdk/chains';
import { createConfig } from '@zama-fhe/sdk/viem';
import { env } from '@zama-indexer/env';
import {
  type Address,
  createPublicClient,
  createWalletClient,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';

let sdkInstance: ZamaSDK | null = null;

export function getIndexerPrivateKey(): `0x${string}` {
  if (!env.INDEXER_PRIVATE_KEY) {
    throw new Error('INDEXER_PRIVATE_KEY is required');
  }

  return env.INDEXER_PRIVATE_KEY as `0x${string}`;
}

export function getContractAddress(): Address {
  if (!env.CONTRACT_ADDRESS) {
    throw new Error('CONTRACT_ADDRESS is required');
  }

  return env.CONTRACT_ADDRESS as Address;
}

export async function getSdk(): Promise<ZamaSDK> {
  if (sdkInstance) {
    return sdkInstance;
  }

  const rpcUrl = env.RPC_URL;
  const account = privateKeyToAccount(getIndexerPrivateKey());
  const localChain = {
    ...anvil,
    network: rpcUrl,
  } as const satisfies FheChain;

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: hardhat,
    transport: http(rpcUrl),
  });

  sdkInstance = new ZamaSDK(
    createConfig({
      chains: [localChain],
      publicClient,
      walletClient,
      storage: memoryStorage,
      relayers: {
        [localChain.id]: cleartext(),
      },
    }),
  );

  return sdkInstance;
}

export async function resetSdk() {
  sdkInstance = null;
}
