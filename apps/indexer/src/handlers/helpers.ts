const ZERO = '0x0000000000000000000000000000000000000000';

export function resolveKind(from: string, to: string): string {
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();

  if (fromLower === ZERO) {
    return 'wrap';
  }

  if (toLower === ZERO) {
    return 'burn';
  }

  return 'transfer';
}

export function toHandle(value: string): string {
  if (value.startsWith('0x')) {
    return value.toLowerCase();
  }

  return `0x${value.toLowerCase()}`;
}
