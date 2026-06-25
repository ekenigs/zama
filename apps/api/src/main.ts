import { env } from '@zama-indexer/env';
import Fastify from 'fastify';
import { registerRoutes } from './routes';

const app = Fastify({ logger: true });

await registerRoutes(app);

await app.listen({ host: env.API_HOST, port: env.API_PORT });
