import type { EncryptedValue } from '@zama-fhe/sdk';
import type { TransferRow } from '@zama-indexer/db';
import { upsertBalance } from '@zama-indexer/db';
import type { Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getContractAddress, getIndexerPrivateKey, getSdk } from './config.js';

const ZERO = '0x0000000000000000000000000000000000000000';

export type DecryptOutcome =
  | { ok: true; cleartext: string }
  | { ok: false; reason: 'acl_denied' | 'sdk_error' | 'timeout' };

function existingCleartext(row: TransferRow): string | null {
  if (row.amountStatus === 'decrypted' && row.amountCleartext) {
    return row.amountCleartext;
  }

  if (row.kind === 'unwrap_finalize' && row.amountCleartext) {
    return row.amountCleartext;
  }

  return null;
}

function indexerCanDecrypt(row: TransferRow, indexerAddress: string): boolean {
  const isParty =
    row.toAddress.toLowerCase() === indexerAddress.toLowerCase() ||
    row.fromAddress.toLowerCase() === indexerAddress.toLowerCase();

  return isParty || row.fromAddress === ZERO || row.toAddress === ZERO;
}

function mapDecryptError(error: unknown, timedOut: boolean): DecryptOutcome {
  if (timedOut) {
    return { ok: false, reason: 'timeout' };
  }

  const message = error instanceof Error ? error.message : String(error);

  if (
    message.toLowerCase().includes('acl') ||
    message.toLowerCase().includes('allow')
  ) {
    return { ok: false, reason: 'acl_denied' };
  }

  return { ok: false, reason: 'sdk_error' };
}

export async function tryDecryptTransfer(
  row: TransferRow,
  timeoutMs: number,
): Promise<DecryptOutcome> {
  const cached = existingCleartext(row);

  if (cached) {
    return { ok: true, cleartext: cached };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sdk = await getSdk();
    const indexerAddress = privateKeyToAccount(getIndexerPrivateKey()).address;

    if (!indexerCanDecrypt(row, indexerAddress)) {
      return { ok: false, reason: 'acl_denied' };
    }

    const handle = row.amountHandle as EncryptedValue;
    const values = await sdk.decryption.decryptValues([
      {
        encryptedValue: handle,
        contractAddress: getContractAddress(),
      },
    ]);
    const cleartext = values[handle];

    if (cleartext === null || cleartext === undefined) {
      return { ok: false, reason: 'acl_denied' };
    }

    return { ok: true, cleartext: String(cleartext) };
  } catch (error) {
    return mapDecryptError(error, controller.signal.aborted);
  } finally {
    clearTimeout(timer);
  }
}

async function refreshAddressBalance(
  address: string,
  blockNumber: bigint,
  token: ReturnType<Awaited<ReturnType<typeof getSdk>>['createToken']>,
) {
  try {
    const balance = await token.balanceOf(address as Address);

    await upsertBalance({
      address,
      contractAddress: getContractAddress(),
      balanceCleartext: String(balance),
      balanceStatus: 'ok',
      blockNumber,
    });
  } catch {
    await upsertBalance({
      address,
      contractAddress: getContractAddress(),
      balanceCleartext: null,
      balanceStatus: 'pending_decryption',
      blockNumber,
    });
  }
}

export async function refreshBalances(
  fromAddress: string,
  toAddress: string,
  blockNumber: bigint,
) {
  const sdk = await getSdk();
  const token = sdk.createToken(getContractAddress());
  const addresses = [fromAddress, toAddress].filter(
    (address) => address.toLowerCase() !== ZERO,
  );

  for (const address of addresses) {
    await refreshAddressBalance(address, blockNumber, token);
  }
}
