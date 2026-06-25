import { cleartext, memoryStorage, ZamaSDK } from '@zama-fhe/sdk';
import { anvil, type FheChain } from '@zama-fhe/sdk/chains';
import { createConfig } from '@zama-fhe/sdk/viem';
import { env } from '@zama-indexer/env';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';

export function createSdk(privateKey: `0x${string}`) {
  const rpcUrl = env.RPC_URL;
  const account = privateKeyToAccount(privateKey);
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

  return new ZamaSDK(
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
}
