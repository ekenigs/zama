import {
  countPendingDecryptions,
  getBalance,
  getIndexerState,
  getTransfersForAddress,
  normalizeAddress,
} from '@zama-indexer/db';
import { env, TOKEN_DECIMALS } from '@zama-indexer/env';
import type { FastifyInstance } from 'fastify';

function resolveContractAddress(override?: string): string {
  const address = override ?? env.CONTRACT_ADDRESS;

  if (!address) {
    throw new Error('CONTRACT_ADDRESS is required');
  }

  return address;
}

function registerStatusRoute(app: FastifyInstance) {
  app.get('/v1/indexer/status', async (_request, reply) => {
    try {
      const state = await getIndexerState();
      const pendingDecryptions = await countPendingDecryptions();

      if (!state) {
        return reply.status(503).send({ error: 'indexer_not_initialized' });
      }

      const blocksBehind = Number(state.latestChainBlock - state.indexedBlock);

      return {
        healthy: true,
        chainId: state.chainId,
        contract: state.contractAddress,
        indexedBlock: Number(state.indexedBlock),
        latestBlock: Number(state.latestChainBlock),
        blocksBehind,
        pendingDecryptions,
        startedAt: state.createdAt.toISOString(),
      };
    } catch {
      return reply.status(503).send({ error: 'database_unavailable' });
    }
  });
}

function registerBalanceRoute(app: FastifyInstance) {
  app.get<{ Params: { address: string }; Querystring: { contract?: string } }>(
    '/v1/addresses/:address/balance',
    async (request, reply) => {
      const address = normalizeAddress(request.params.address);
      const contract = normalizeAddress(
        resolveContractAddress(request.query.contract),
      );
      const row = await getBalance(address, contract);

      if (!row) {
        return reply.status(404).send({ error: 'address_not_found' });
      }

      return {
        address,
        contract,
        balance: row.balanceCleartext,
        status: row.balanceStatus,
        decimals: TOKEN_DECIMALS,
        blockNumber: row.blockNumber === null ? null : Number(row.blockNumber),
      };
    },
  );
}

function parseTransferCursor(cursor?: string) {
  if (!cursor) {
    return { cursorBlock: undefined, cursorLogIndex: undefined };
  }

  const [block, logIndex] = cursor.split(':');

  if (!block || !logIndex) {
    return { cursorBlock: undefined, cursorLogIndex: undefined };
  }

  return {
    cursorBlock: BigInt(block),
    cursorLogIndex: Number(logIndex),
  };
}

function mapTransferPage(
  items: Awaited<ReturnType<typeof getTransfersForAddress>>,
  limit: number,
) {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last ? `${last.blockNumber}:${last.logIndex}` : null;

  return {
    items: page.map((row) => ({
      id: row.id,
      kind: row.kind,
      from: row.fromAddress,
      to: row.toAddress,
      amount:
        row.amountStatus === 'decrypted' && row.amountCleartext
          ? { status: 'decrypted', value: row.amountCleartext }
          : { status: 'pending_decryption' },
      blockNumber: Number(row.blockNumber),
      txHash: row.txHash,
    })),
    nextCursor,
  };
}

function registerTransfersRoute(app: FastifyInstance) {
  app.get<{
    Params: { address: string };
    Querystring: {
      contract?: string;
      limit?: string;
      cursor?: string;
      direction?: string;
    };
  }>('/v1/addresses/:address/transfers', async (request) => {
    const address = normalizeAddress(request.params.address);
    const contract = normalizeAddress(
      resolveContractAddress(request.query.contract),
    );
    const limit = Math.min(Number(request.query.limit ?? 50), 200);
    const direction = (request.query.direction ?? 'all') as
      | 'in'
      | 'out'
      | 'all';
    const { cursorBlock, cursorLogIndex } = parseTransferCursor(
      request.query.cursor,
    );

    const items = await getTransfersForAddress({
      address,
      contractAddress: contract,
      limit: limit + 1,
      cursorBlock,
      cursorLogIndex,
      direction,
    });

    return mapTransferPage(items, limit);
  });
}

export async function registerRoutes(app: FastifyInstance) {
  registerStatusRoute(app);
  registerBalanceRoute(app);
  registerTransfersRoute(app);
}
