// Boots a fully isolated stack for Playwright: a fresh embedded Postgres, the
// migrations, and a production build of the app served by `next start`.
// Realtime runs over the built-in SSE transport (no Supabase needed).
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { freePort, startEmbeddedDb } from "./lib/embedded-db";
import { migrate } from "./lib/migrate";

const PORT = Number(process.env.E2E_PORT ?? 3100);

async function main() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "unison-e2e-pg-"));
  const database = await startEmbeddedDb({
    dataDir: path.join(dir, "data"),
    port: await freePort(),
    persistent: false,
  });
  await migrate(database.url, (m) => console.log(`[e2e db] ${m}`));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: database.url,
    NEXT_DIST_DIR: ".next-e2e",
    RATE_LIMIT_SCALE: "50",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  };

  if (!process.env.E2E_SKIP_BUILD) {
    const build = spawnSync("npx", ["next", "build"], { stdio: "inherit", env });
    if (build.status !== 0) throw new Error("next build failed");
  }

  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "inherit", env });
  const shutdown = async () => {
    server.kill("SIGTERM");
    await database.stop();
    await rm(dir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  server.on("exit", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
