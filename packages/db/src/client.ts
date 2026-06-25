import { env } from '@zama-indexer/env';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let client: postgres.Sql | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDatabaseUrl(): string {
  return env.DATABASE_URL;
}

export function createDb(connectionString = getDatabaseUrl()) {
  const sql = postgres(connectionString, { max: 10 });
  const db = drizzle(sql, { schema });

  return { db, sql };
}

export function getDb() {
  if (!database) {
    const created = createDb();
    client = created.sql;
    database = created.db;
  }

  return database;
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
    database = null;
  }
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
});
