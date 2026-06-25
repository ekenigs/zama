import { type Address, bytesToHex, isAddress } from 'viem';
import {
  type HDAccount,
  mnemonicToAccount,
  type PrivateKeyAccount,
  privateKeyToAccount,
} from 'viem/accounts';

const ANVIL_MNEMONIC =
  'test test test test test test test test test test test junk';

const ANVIL_ACCOUNT_COUNT = 10;

const accounts = new Map<string, HDAccount>();

for (let index = 0; index < ANVIL_ACCOUNT_COUNT; index += 1) {
  const account = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });

  accounts.set(account.address.toLowerCase(), account);
}

export type ScriptAccount = HDAccount | PrivateKeyAccount;

export function normalizeAddress(value: string): Address {
  if (!isAddress(value)) {
    throw new Error(`Invalid address: ${value}`);
  }

  return value as Address;
}

export function resolveAccount(
  address: string,
  privateKeyOverride?: string,
): ScriptAccount {
  if (privateKeyOverride) {
    return privateKeyToAccount(privateKeyOverride as `0x${string}`);
  }

  const account = accounts.get(normalizeAddress(address).toLowerCase());

  if (!account) {
    throw new Error(
      `No Anvil dev account for ${address} — pass --private-key or use accounts #0–#9`,
    );
  }

  return account;
}

export function privateKeyFor(
  account: ScriptAccount,
  privateKeyOverride?: string,
): `0x${string}` {
  if (privateKeyOverride) {
    return privateKeyOverride as `0x${string}`;
  }

  if (account.source !== 'hd') {
    throw new Error('Could not derive private key for account');
  }

  const privateKeyBytes = account.getHdKey().privateKey;

  if (!privateKeyBytes) {
    throw new Error('Could not derive private key for account');
  }

  return bytesToHex(privateKeyBytes);
}
