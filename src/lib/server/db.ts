import "server-only";
import postgres from "postgres";
import { serverEnv } from "./env";

type Sql = postgres.Sql<Record<string, never>>;

const globalForDb = globalThis as unknown as { __unisonSql?: Sql };

/**
 * One pooled client per server process (reused across hot reloads in dev).
 * `prepare: false` keeps this compatible with Supabase's transaction pooler,
 * which is what serverless deployments should connect through.
 */
export function db(): Sql {
  if (!globalForDb.__unisonSql) {
    const env = serverEnv();
    globalForDb.__unisonSql = postgres(env.DATABASE_URL, {
      max: env.DATABASE_POOL_MAX,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    }) as Sql;
  }
  return globalForDb.__unisonSql;
}

export async function closeDb(): Promise<void> {
  const sql = globalForDb.__unisonSql;
  globalForDb.__unisonSql = undefined;
  await sql?.end({ timeout: 5 });
}
