import { contractAddress, createSdk } from '@zama-indexer/decrypt';
import { env, TOKEN_DECIMALS } from '@zama-indexer/env';
import { Command } from 'commander';
import { parseUnits } from 'viem';
import {
  normalizeAddress,
  privateKeyFor,
  resolveAccount,
} from './lib/accounts';
import { runCliMain } from './lib/run';
import { waitForTransferDecrypted } from './lib/wait';

async function main() {
  const program = new Command()
    .name('send')
    .description('Confidential transfer between two addresses')
    .requiredOption('--from <address>', 'sender address')
    .requiredOption('--to <address>', 'recipient address')
    .requiredOption('--amount <amount>', 'human-readable token amount')
    .option('--private-key <key>', 'private key override')
    .option('--wait', 'block until API shows decrypted amount')
    .action(async (options) => {
      const from = normalizeAddress(options.from);
      const to = normalizeAddress(options.to);
      const baseUnits = parseUnits(options.amount, TOKEN_DECIMALS);
      const account = resolveAccount(from, options.privateKey);
      const privateKey = privateKeyFor(account, options.privateKey);

      const sdk = createSdk(privateKey);
      const token = sdk.createWrappedToken(contractAddress);
      const result = await token.confidentialTransfer(to, baseUnits);

      console.log(`txHash: ${result.txHash}`);

      if (options.wait) {
        const cleartext = await waitForTransferDecrypted(
          to,
          result.txHash,
          env.WORKER_POLL_INTERVAL_MS * 15,
        );

        console.log(`decrypted amount: ${cleartext}`);
      }
    });

  await program.parseAsync(process.argv);
}

runCliMain(main);
