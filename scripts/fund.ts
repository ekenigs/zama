import { contractAddress, createSdk } from '@zama-indexer/decrypt';
import { env, TOKEN_DECIMALS } from '@zama-indexer/env';
import { Command } from 'commander';
import { createWalletClient, http, parseAbi, parseUnits } from 'viem';
import { hardhat } from 'viem/chains';
import {
  normalizeAddress,
  privateKeyFor,
  resolveAccount,
} from './lib/accounts';
import { runCliMain } from './lib/run';

const erc20Abi = parseAbi([
  'function mint(address to, uint256 amount) external',
]);

async function main() {
  const program = new Command()
    .name('fund')
    .description('Mint underlying ERC20 and shield to confidential balance')
    .requiredOption('--address <address>', 'account to fund')
    .requiredOption('--amount <amount>', 'human-readable token amount')
    .option('--private-key <key>', 'private key override')
    .action(async (options) => {
      const address = normalizeAddress(options.address);
      const account = resolveAccount(address, options.privateKey);
      const privateKey = privateKeyFor(account, options.privateKey);
      const underlyingAmount = parseUnits(options.amount, TOKEN_DECIMALS);

      if (!env.UNDERLYING_ADDRESS) {
        throw new Error(
          'UNDERLYING_ADDRESS is required in .env — run pnpm dev to deploy contracts',
        );
      }

      const walletClient = createWalletClient({
        account,
        chain: hardhat,
        transport: http(env.RPC_URL),
      });

      const mintHash = await walletClient.writeContract({
        address: env.UNDERLYING_ADDRESS,
        abi: erc20Abi,
        functionName: 'mint',
        args: [account.address, underlyingAmount],
      });

      console.log(`mint tx: ${mintHash}`);

      const sdk = createSdk(privateKey);
      const wrapped = sdk.createWrappedToken(contractAddress);
      const shieldResult = await wrapped.shield(underlyingAmount);

      console.log(`shield tx: ${shieldResult.txHash}`);
      console.log(
        `funded ${address} with ${options.amount} confidential tokens`,
      );
    });

  await program.parseAsync(process.argv);
}

runCliMain(main);
