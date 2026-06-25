import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const databaseUrl =
  process.env['DATABASE_URL'] ??
  'postgresql://postgres:postgres@127.0.0.1:5432/zama';
const contract = '0x1111111111111111111111111111111111111111';
const indexerRecipient = '0x2222222222222222222222222222222222222222';
const thirdPartyA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const thirdPartyB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

process.env['DATABASE_URL'] = databaseUrl;
process.env['CONTRACT_ADDRESS'] = contract;

const { closeDb, insertTransfer, migrate, upsertIndexerState } = await import(
  '@zama-indexer/db'
);
const { default: Fastify } = await import('fastify');
const { registerRoutes } = await import('../../apps/api/src/routes');

describe('indexer API e2e', () => {
  let app: ReturnType<typeof Fastify>;

  before(async () => {
    await migrate(databaseUrl);

    await upsertIndexerState({
      chainId: 31337,
      contractAddress: contract,
      indexedBlock: 100n,
      latestChainBlock: 100n,
      pendingDecryptionCount: 0,
      lastError: null,
    });

    app = Fastify();
    await registerRoutes(app);
    await app.ready();
  });

  after(async () => {
    await app.close();
    await closeDb();
  });

  it('happy path: decrypted transfer is returned with cleartext amount', async () => {
    await insertTransfer({
      id: '0xhappy-18dec-1',
      txHash: '0xhappy',
      logIndex: 1,
      blockNumber: 99n,
      fromAddress: thirdPartyA,
      toAddress: indexerRecipient,
      amountHandle: `0x${'11'.repeat(32)}`,
      amountStatus: 'decrypted',
      amountCleartext: '1000000000000000000',
      kind: 'transfer',
      contractAddress: contract,
      chainId: 31337,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/addresses/${indexerRecipient}/transfers`,
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      items: Array<{
        id: string;
        amount: { status: string; value?: string };
      }>;
    };

    const decrypted = body.items.find((item) => item.id === '0xhappy-18dec-1');
    assert.ok(decrypted);
    assert.equal(decrypted.amount.value, '1000000000000000000');
  });

  it('negative: third-party transfer stays pending_decryption and is not dropped', async () => {
    await insertTransfer({
      id: '0xnegative-2',
      txHash: '0xnegative',
      logIndex: 2,
      blockNumber: 98n,
      fromAddress: thirdPartyA,
      toAddress: thirdPartyB,
      amountHandle: `0x${'22'.repeat(32)}`,
      amountStatus: 'pending_decryption',
      amountCleartext: null,
      kind: 'transfer',
      contractAddress: contract,
      chainId: 31337,
    });

    const transfersResponse = await app.inject({
      method: 'GET',
      url: `/v1/addresses/${thirdPartyA}/transfers`,
    });

    assert.equal(transfersResponse.statusCode, 200);
    const transfersBody = transfersResponse.json() as {
      items: Array<{ id: string; amount: { status: string } }>;
    };

    const pending = transfersBody.items.find(
      (item) => item.id === '0xnegative-2',
    );
    assert.ok(pending);
    assert.equal(pending.amount.status, 'pending_decryption');

    const statusResponse = await app.inject({
      method: 'GET',
      url: '/v1/indexer/status',
    });
    assert.equal(statusResponse.statusCode, 200);
    const statusBody = statusResponse.json() as { pendingDecryptions: number };

    assert.ok(statusBody.pendingDecryptions >= 1);
  });
});
