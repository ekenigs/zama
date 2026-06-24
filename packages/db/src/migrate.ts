import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as runMigrations } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

export async function migrate(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  await runMigrations(db, { migrationsFolder });
  await sql.end();
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  const { env } = await import('@zama-indexer/env');

  await migrate(env.DATABASE_URL);
}
