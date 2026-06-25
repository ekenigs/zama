import {
  contractAddress,
  createSdk,
  indexerPrivateKey,
} from '@zama-indexer/decrypt';
import { Command } from 'commander';
import { privateKeyToAccount } from 'viem/accounts';
import {
  normalizeAddress,
  privateKeyFor,
  resolveAccount,
} from './lib/accounts';
import { runCliMain } from './lib/run';

async function main() {
  const program = new Command()
    .name('grant')
    .description('Delegate decrypt rights from sender to indexer EOA')
    .requiredOption('--from <address>', 'transfer sender (delegator)')
    .option('--private-key <key>', 'private key override')
    .option(
      '--expiration-days <days>',
      'delegation lifetime in days',
      (value) => {
        const days = Number(value);

        if (!Number.isFinite(days) || days < 1) {
          throw new Error('--expiration-days must be a positive number');
        }

        return days;
      },
      365,
    )
    .action(async (options) => {
      const delegator = normalizeAddress(options.from);
      const account = resolveAccount(delegator, options.privateKey);
      const privateKey = privateKeyFor(account, options.privateKey);
      const sdk = createSdk(privateKey);
      const indexerAddress = privateKeyToAccount(indexerPrivateKey).address;
      const expirationDate = new Date(
        Date.now() + options.expirationDays * 24 * 60 * 60 * 1000,
      );

      const result = await sdk.delegations.delegateDecryption({
        contractAddress,
        delegateAddress: indexerAddress,
        expirationDate,
      });

      console.log(`delegator: ${delegator}`);
      console.log(`indexer (delegate): ${indexerAddress}`);
      console.log(`grant tx: ${result.txHash}`);
    });

  await program.parseAsync(process.argv);
}

runCliMain(main);
