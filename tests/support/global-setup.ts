import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { freePort, startEmbeddedDb } from "../../scripts/lib/embedded-db";
import { migrate } from "../../scripts/lib/migrate";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/** Boot a throwaway real Postgres for the whole test run. */
export default async function setup(project: TestProject) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "unison-test-pg-"));
  const database = await startEmbeddedDb({
    dataDir: path.join(dir, "data"),
    port: await freePort(),
    persistent: false,
  });
  await migrate(database.url, () => {});
  project.provide("databaseUrl", database.url);
  return async () => {
    await database.stop();
    await rm(dir, { recursive: true, force: true });
  };
}
