import type { EncryptedValue, ZamaSDK } from '@zama-fhe/sdk';
import type { TransferRow } from '@zama-indexer/db';
import { upsertBalance } from '@zama-indexer/db';
import type { Address } from 'viem';
import { contractAddress, sdk } from './config';

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

function mapDecryptError(error: unknown, timedOut: boolean): DecryptOutcome {
  if (timedOut) {
    return { ok: false, reason: 'timeout' };
  }

  const message = error instanceof Error ? error.message : String(error);

  if (
    message.toLowerCase().includes('acl') ||
    message.toLowerCase().includes('allow') ||
    message.toLowerCase().includes('delegation')
  ) {
    return { ok: false, reason: 'acl_denied' };
  }

  return { ok: false, reason: 'sdk_error' };
}

function isZeroAddress(value: string): boolean {
  return value.toLowerCase() === ZERO;
}

async function decryptValuesPath(
  client: ZamaSDK,
  handle: EncryptedValue,
  tokenAddress: Address,
): Promise<DecryptOutcome> {
  const values = await client.decryption.decryptValues([
    {
      encryptedValue: handle,
      contractAddress: tokenAddress,
    },
  ]);
  const cleartext = values[handle];

  if (cleartext === null || cleartext === undefined) {
    return { ok: false, reason: 'acl_denied' };
  }

  return { ok: true, cleartext: String(cleartext) };
}

async function tryDelegatedDecrypt(
  client: ZamaSDK,
  handle: EncryptedValue,
  tokenAddress: Address,
  delegatorAddress: Address,
): Promise<DecryptOutcome> {
  const values = await client.decryption.delegatedDecryptValues(
    [
      {
        encryptedValue: handle,
        contractAddress: tokenAddress,
      },
    ],
    delegatorAddress,
  );
  const cleartext = values[handle];

  if (cleartext === null || cleartext === undefined) {
    return { ok: false, reason: 'acl_denied' };
  }

  return { ok: true, cleartext: String(cleartext) };
}

async function runWithTimeout(
  operation: () => Promise<DecryptOutcome>,
  timeoutMs: number,
): Promise<DecryptOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation();
  } catch (error) {
    return mapDecryptError(error, controller.signal.aborted);
  } finally {
    clearTimeout(timer);
  }
}

export async function tryDecryptTransfer(
  row: TransferRow,
  timeoutMs: number,
): Promise<DecryptOutcome> {
  const cached = existingCleartext(row);

  if (cached) {
    return { ok: true, cleartext: cached };
  }

  try {
    const handle = row.amountHandle as EncryptedValue;

    if (isZeroAddress(row.fromAddress) || isZeroAddress(row.toAddress)) {
      return runWithTimeout(
        () => decryptValuesPath(sdk, handle, contractAddress),
        timeoutMs,
      );
    }

    if (row.kind === 'transfer') {
      return runWithTimeout(
        () =>
          tryDelegatedDecrypt(
            sdk,
            handle,
            contractAddress,
            row.fromAddress as Address,
          ),
        timeoutMs,
      );
    }

    return { ok: false, reason: 'acl_denied' };
  } catch (error) {
    return mapDecryptError(error, false);
  }
}

async function refreshAddressBalance(
  address: string,
  blockNumber: bigint,
  token: ReturnType<typeof sdk.createToken>,
) {
  try {
    const balance = await token.balanceOf(address as Address);

    await upsertBalance({
      address,
      contractAddress,
      balanceCleartext: String(balance),
      balanceStatus: 'ok',
      blockNumber,
    });
  } catch {
    await upsertBalance({
      address,
      contractAddress,
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
  const token = sdk.createToken(contractAddress);
  const addresses = [fromAddress, toAddress].filter(
    (address) => !isZeroAddress(address),
  );

  for (const address of addresses) {
    await refreshAddressBalance(address, blockNumber, token);
  }
}
