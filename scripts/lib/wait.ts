import { setTimeout } from 'node:timers/promises';
import { env } from '@zama-indexer/env';

type TransferItem = {
  txHash: string;
  amount: { status: string; value?: string };
};

export async function waitForTransferDecrypted(
  recipient: string,
  txHash: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const baseUrl = `http://${env.API_HOST === '0.0.0.0' ? '127.0.0.1' : env.API_HOST}:${env.API_PORT}`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(
        `${baseUrl}/v1/addresses/${recipient}/transfers?direction=in&limit=50`,
      );

      if (res.ok) {
        const body = (await res.json()) as { items: TransferItem[] };
        const match = body.items.find(
          (item) =>
            item.txHash.toLowerCase() === txHash.toLowerCase() &&
            item.amount.status === 'decrypted' &&
            item.amount.value !== undefined,
        );

        if (match?.amount.value !== undefined) {
          return match.amount.value;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      console.log(`wait: API poll failed (${message}), retrying…`);
    }

    await setTimeout(500);
  }

  throw new Error(
    `Timed out waiting for ${txHash} to decrypt for ${recipient}`,
  );
}
