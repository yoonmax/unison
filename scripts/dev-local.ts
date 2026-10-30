// One-command local development: start an embedded Postgres (data kept in
// .data/postgres), apply migrations, then run `next dev` against it.
//
// Usage: npm run dev:local
import { spawn } from "node:child_process";
import { startEmbeddedDb } from "./lib/embedded-db";
import { migrate } from "./lib/migrate";

const PORT = Number(process.env.UNISON_DB_PORT ?? 54329);

async function main() {
  const database = await startEmbeddedDb({ dataDir: ".data/postgres", port: PORT, persistent: true });
  await migrate(database.url, (m) => console.log(`[db] ${m}`));
  console.log(`[db] ready at ${database.url}`);

  const next = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: database.url },
  });

  const shutdown = async () => {
    next.kill("SIGINT");
    await database.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  next.on("exit", async (code) => {
    await database.stop();
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
