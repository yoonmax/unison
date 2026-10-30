import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../supabase/migrations");

/**
 * Apply pending SQL migrations in filename order. Safe to run repeatedly. Works against any Postgres, including Supabase
 * (use the direct or session-pooler connection string for migrations).
 */
export async function migrate(databaseUrl: string, log: (msg: string) => void = console.log) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`create schema if not exists unison`;
    await sql`
      create table if not exists unison.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )`;
    await sql`alter table unison.schema_migrations enable row level security`;

    const applied = new Set((await sql`select name from unison.schema_migrations`).map((r) => r.name as string));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into unison.schema_migrations (name) values (${file})`;
      });
      log(`applied ${file}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
